import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';

// 


export default function HomeScreen({ setCurrentScreen, db}) {

  const [reloadFlag, setReloadFlag] = useState(false);

  useEffect(() => {
    db.transaction(tx => {
      tx.executeSql(
        "CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, uri TEXT, creationTime TEXT, who TEXT, where_db TEXT, what TEXT, how TEXT, whoEmbedding TEXT, whereEmbedding TEXT, whatEmbedding TEXT, howEmbedding TEXT, totalEmbedding TEXT);",
        [],
        () => console.log('Table created successfully OR table retained'),
        (_, error) => console.log('Error creating table', error)
      );
    });
  }, [reloadFlag]);

  // 이미지를 Base64로 인코딩하는 함수
  async function encodeImage(uri, maxWidth, maxHeight, quality) {
    try {
      // 이미지 크기 조정 및 압축
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: maxWidth, height: maxHeight } }],
        { compress: quality / 100, format: ImageManipulator.SaveFormat.JPEG }
      );
  
      // Base64로 인코딩
      return await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (error) {
      console.error('Error processing image:', error);
    }
  }
  

  // GPT-4 Vision API를 호출하여 이미지 분석
  async function analyzeImageWithGPT4Vision(uri) {
    try {
      const base64Image = await encodeImage(uri, 800, 600, 70);

      
      // Replace with your Node.js server URL
      const serverUrl = 'http://IP주소:3000/analyze-image'; 
  
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image }),
      });
  
      const responseData = await response.json();
      return responseData;
    } catch (error) {
      console.error('Error sending image to server:', error);
    }
  }
  


  const saveImageToDB = async (uri, creationTime) => {
    try {
      // 이미지가 DB에 이미 존재하는지 확인
      const result = await new Promise((resolve, reject) => {
        db.transaction(tx => {
          tx.executeSql(
            "SELECT * FROM images WHERE uri = ?;",
            [uri],
            (_, { rows }) => resolve(rows.length === 0),
            (_, error) => {
              console.log('Error querying image', error);
              reject(error);
            }
          );
        });
      });
  
      if (result) {
        const analysisResult = await analyzeImageWithGPT4Vision(uri);
        const startIndex = analysisResult.indexOf('{');
        const endIndex = analysisResult.lastIndexOf('}');
        const extractedJson = analysisResult.substring(startIndex, endIndex + 1);
        const analysisObject = JSON.parse(extractedJson);
  
        const who = analysisObject.who;
        const where = analysisObject.where;
        const what = analysisObject.what;
        const how = analysisObject.how;

        // undefined가 아닌 값들만 골라서 배열에 추가합니다.
        const validParts = [];
        if (who !== "undefined") validParts.push(who);
        if (where !== "undefined") validParts.push(where);
        if (what !== "undefined") validParts.push(what);
        if (how !== "undefined") validParts.push(how);

        // 배열의 원소들을 공백으로 구분하여 하나의 문자열로 합칩니다.
        const totalText = validParts.join(' ').replace(/"/g, '');
        console.log("totalText: ", totalText)
  
        // 여기에 임베딩을 생성하는 코드를 추가하세요.
        // 예시 코드는 실제 임베딩 생성 과정을 구현하지 않습니다.
        
        const whoEmbedding = JSON.stringify(await generateEmbedding(JSON.stringify(analysisObject.who)));
        const whereEmbedding = JSON.stringify(await generateEmbedding(JSON.stringify(analysisObject.where)));
        const whatEmbedding = JSON.stringify(await generateEmbedding(JSON.stringify(analysisObject.what)));
        const howEmbedding = JSON.stringify(await generateEmbedding(JSON.stringify(analysisObject.how)));
        const totalEmbedding = JSON.stringify(await generateEmbedding(JSON.stringify(totalText)));

          
        await new Promise((resolve, reject) => {
          db.transaction(tx => {
            tx.executeSql(
              "INSERT INTO images (uri, creationTime, who, where_db, what, how, whoEmbedding, whereEmbedding, whatEmbedding, howEmbedding, totalEmbedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
              [uri, creationTime, who, where, what, how, whoEmbedding, whereEmbedding, whatEmbedding, howEmbedding, totalEmbedding],
              () => {
                console.log('Image and analysis saved successfully');
                resolve();
              },
              (_, error) => {
                console.log('Error saving image and analysis', error);
                reject(error);
              }
            );
          });
        });
      } else {
        console.log('Image already exists in the database');
      }
    } catch (error) {
      console.error("Error in saveImageToDB:", error);
    }
  };
  
  async function generateEmbedding(text) {
    try {
      const response = await axios.post('http://IP주소:3000/generate-embeddings', { text });
      return response.data;
    } catch (error) {
      console.error("Error in generateEmbedding:", error);
      alert('Error occurred while generating embedding'); // 사용자에게 에러 알림
      return null;
    }
  }


  const [loading, setLoading] = useState(false);

  const [dbImageLen, setDbImageLen] = useState(0); // useState를 사용하여 상태 관리

  const loadAllImages = async () => {
    setLoading(true);
    let allImages = [];
    let hasNextPage = true;
    let endCursor = null;
  
    try {
      db.transaction(tx => {
        tx.executeSql(
          "SELECT COUNT(*) as count FROM images;",
          [],
          (_, { rows }) => {
            setDbImageLen(rows.item(0).count); // 데이터베이스에 저장된 이미지 개수 업데이트
          },
          (_, error) => {
            console.log('Error fetching images count from DB', error);
          }
        );
      });
  
      const desiredImageCount = 40;
      const batch = 20;  
      while (hasNextPage && allImages.length < desiredImageCount) {
        const result = await MediaLibrary.getAssetsAsync({
          mediaType: 'photo',
          first: batch,
          after: endCursor,
        });
  
        allImages = allImages.concat(result.assets);
        hasNextPage = result.hasNextPage;
        endCursor = result.endCursor;
      }
    } catch (error) {
      console.log(error);
    }
  
    return allImages;
  };
  



  const pickImages = async () => {
    try {
      setLoading(true);
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('권한 요청', '갤러리에 접근하기 위한 권한이 필요합니다!');
        return;
      }
  
      const allImages = await loadAllImages();
      const savePromises = allImages.map(image => 
        saveImageToDB(image.uri, image.creationTime.toString())
      );
      console.log()
  
      await Promise.all(savePromises);
    } catch (error) {
      console.log('Error processing images:', error);
    } finally {
      setLoading(false);
    }
  };
  

  const moveToChat = () => {
      // 이미지 처리 후 채팅 화면으로 전환
      setCurrentScreen('Chat');
  }
  

  const fetchAllImagesFromDB = () => {
    console.log("fetchAllImagesFromDB");
    db.transaction(tx => {
        // SELECT 쿼리에서 필요한 열만 지정
        tx.executeSql(
            "SELECT who, where_db, what, how, uri FROM images;",
            [],
            (_, { rows }) => {
                let images = [];
                for (let i = 0; i < rows.length; i++) {
                    images.push({
                        who: rows.item(i).who,
                        where: rows.item(i).where_db,
                        what: rows.item(i).what,
                        how: rows.item(i).how,
                        uri : rows.item(i).uri
                    });
                }
                
                console.log("Fetched images from DB:", JSON.stringify(images, null, 2)); // 구조화된 형태로 출력
                console.log("Total images:", rows.length); // 이미지 수 출력
            },
            (_, error) => {
                console.log('Error fetching images from DB', error);
            }
        );
    });
};

  
  
  const flushDB = () => {
    db.transaction(tx => {
      tx.executeSql(
        "DROP TABLE IF EXISTS images;",
        [],
        () => {
          console.log('Table dropped successfully');
          setReloadFlag(prev => !prev); // 상태 변경으로 useEffect 재실행
        },
        (_, error) => console.log('Error dropping table', error)
      );
    });    
  };

  return (
    // https://ibb.co/vJ6RND8
    <View style={styles.container}>
      {loading ? (
        <>
          <ActivityIndicator size="large" />
          <Text>갤러리 내 이미지 로드 중...</Text>
          <Text>적게는 1분 많게는 10분까지 소요...</Text>
        </>
      ) : (
        <>
          <Image source={{ uri: "https://i.ibb.co/qR3VHxw/Image-Buzzy.png" }} style={styles.image} />
          {/* <Text>챗봇 UI 앱에 오신 것을 환영합니다!</Text> */}
          <TouchableOpacity style={styles.button} onPress={pickImages}>
            <Text style={styles.buttonText}>갤러리에서 이미지 가져오기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={fetchAllImagesFromDB}>
            <Text style={styles.buttonText}>DB 정보 조회</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={flushDB}>
            <Text style={styles.buttonText}>DB 항목 지우기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={moveToChat}>
            <Text style={styles.buttonText}>사진 찾기</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%', // 이미지의 너비
    height: 240, // 이미지의 높이
    resizeMode: 'contain', // 이미지의 비율 유지
    margin : 40
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  button: {
    backgroundColor: '#fadd05',
    padding: 10,
    margin: 10,
    borderRadius: 5,
    width : 300,
  },
  buttonText: {
    color: '#211d00',
    textAlign: 'center'
  }
});

