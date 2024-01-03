// ChatScreen.js
import React, { useState } from 'react';
import { GiftedChat, Bubble, Avatar, Time } from 'react-native-gifted-chat';
import axios from 'axios';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
// import db from './database'; // 올바른 경로로 대체하세요
import { dot, norm } from 'mathjs';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('images.db');

export default function ChatScreen({ setCurrentScreen, db}) {

    const fetchAllImagesFromDB = () => {
        db.transaction(tx => {
            // SELECT 쿼리에서 필요한 열만 지정
            tx.executeSql(
                "SELECT who, where_db, what, how FROM images;",
                [],
                (_, { rows }) => {
                    let images = [];
                    for (let i = 0; i < rows.length; i++) {
                        images.push({
                            who: rows.item(i).who,
                            where: rows.item(i).where_db,
                            what: rows.item(i).what,
                            how: rows.item(i).how
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

    const initialMessages = [
        {
            _id: 1, // 고유한 메시지 ID
            text: '🔍어떤 이미지를 찾고 싶으신가요? \n⭐"누가/어디에서/무엇을/어떻게"\n정보를 포함하여 검색하면 이미지를 더 빨리 찾을 수 있어요! \n🐝유사도를 분석해 가장 일치하는 상위 5개 이미지를 제공해 드려요.\n영어로 검색해주세요!', // 메시지 텍스트
            createdAt: new Date(), // 메시지 생성 시간
            user: {
                _id: 2, // 시스템 또는 봇의 사용자 ID
                name: 'Chatbot', // 사용자 이름 또는 별명
                avatar: "https://i.ibb.co/4j9r1JM/bee.jpg", // 사용자 아바타 URL (선택적)
            },
        },
        // 여기에 추가적인 초기 메시지를 넣을 수 있습니다.
    ];
    
    const [messages, setMessages] = useState(initialMessages);

    async function onSend(newMessages = []) {
        setMessages(GiftedChat.append(messages, newMessages));
        const text = newMessages[0].text;

        try {
            // Node 서버로 텍스트 분석 요청
            const response = await axios.post('http://192.168.0.13:3000/analyze-chat', { text });
            const data = response.data;

            // 서버 응답이 JSON 문자열인 경우, 이를 객체로 파싱합니다.
            const parsedData = JSON.parse(data.reply);

            // 객체에서 필요한 값을 추출합니다.
            const who = parsedData.who;
            const where = parsedData.where;
            const what = parsedData.what;
            const how = parsedData.how;

            // undefined가 아닌 값들만 골라서 배열에 추가합니다.
            const validParts = [];
            if (who !== "undefined") validParts.push(who);
            if (where !== "undefined") validParts.push(where);
            if (what !== "undefined") validParts.push(what);
            if (how !== "undefined") validParts.push(how);

            // 배열의 원소들을 공백으로 구분하여 하나의 문자열로 합칩니다.
            const totalText = validParts.join(' ').replace(/"/g, '');
            console.log("userTotalText: ", totalText)

            try {
                // node 서버로부터 임베딩 받기
                // 각 요소에 대한 임베딩을 요청합니다.
                // const whoEmbeddingResponse = await axios.post('http://192.168.0.13:3000/generate-embeddings', { text : who });
                // const whereEmbeddingResponse = await axios.post('http://192.168.0.13:3000/generate-embeddings', { text : where });
                // const whatEmbeddingResponse = await axios.post('http://192.168.0.13:3000/generate-embeddings', { text : what });
                // const howEmbeddingResponse = await axios.post('http://192.168.0.13:3000/generate-embeddings', { text : how });
                const totalEmbeddingResponse = await axios.post('http://192.168.0.13:3000/generate-embeddings', { text : totalText });

                // 임베딩 결과를 객체로 구성합니다.
                const embeddings = {
                    // who: whoEmbeddingResponse.data,
                    // where: whereEmbeddingResponse.data,
                    // what: whatEmbeddingResponse.data,
                    // how: howEmbeddingResponse.data,
                    total : totalEmbeddingResponse.data,
                };

                // SQLite DB에서 데이터 가져오기
                db.transaction(tx => {
                    tx.executeSql(
                        `SELECT * FROM images;`,
                        [],
                        (_, { rows: { _array } }) => {
                            // 여기서 유사도 계산
                            const topFiveSimilarItems = findMostSimilar(embeddings, _array);
                    
                            // 유사도가 가장 높은 상위 5개 항목을 출력
                            console.log("Top 5 most similar photos:");
                            topFiveSimilarItems.forEach((item, index) => {
                                console.log(`Photo ${index + 1}:`);
                                console.log("Who:", item.who);
                                console.log("What:", item.what);
                                console.log("Where:", item.where_db);
                                console.log("How:", item.how);
                                console.log("uri: ", item.uri)
                                console.log("---");
                            });

                            const reversedTopFiveSimilarItems = [...topFiveSimilarItems].reverse();
                            // 새로운 이미지 메시지 객체들을 생성
                            // 새로운 이미지 메시지 객체들을 생성
                            const imageMessages = reversedTopFiveSimilarItems.map((item, index) => {
                                return {
                                    _id: Math.round(Math.random() * 1000000), // 고유 ID 생성
                                    createdAt: new Date(), // 메시지 생성 시간
                                    user: {
                                        _id: 2, // 시스템 또는 봇의 사용자 ID
                                        name: 'Chatbot',
                                        avatar: "https://i.ibb.co/4j9r1JM/bee.jpg",
                                    },
                                    image: item.uri, // 이미지 URI
                                };
                            });

                            // 확인 메시지 객체
                            const confirmMessages = {
                                _id: Math.round(Math.random() * 1000000), // 고유한 메시지 ID
                                text: '찾으시는 이미지가 있나요? 없다면 조금 더 구체적으로 이미지를 묘사해 주세요!',
                                createdAt: new Date(), // 메시지 생성 시간
                                user: {
                                    _id: 2, // 시스템 또는 봇의 사용자 ID
                                    name: 'Chatbot',
                                    avatar: "https://i.ibb.co/4j9r1JM/bee.jpg",
                                },
                            };

                            // 모든 메시지를 결합하여 업데이트
                            setMessages(previousMessages => GiftedChat.append(previousMessages, [...imageMessages, confirmMessages]));

                        },
                        (_, error) => console.error(error)
                    );
                });                
            } catch (error) {
                console.error(error);
            }

        } catch (error) {
            console.error(error);
        }
    }

    function findMostSimilar(embeddings, dbItems) {
        const similarityScores = dbItems.map(item => {
            let totalSimilarity = 0;
            let validKeysCount = 0;
    
            Object.keys(embeddings).forEach(key => {
                if (key == 'total' && embeddings[key] && item[key + 'Embedding']) {
                    const itemEmbedding = JSON.parse(item[key + 'Embedding']);
                    const similarity = cosineSimilarity(embeddings[key], itemEmbedding);
                    totalSimilarity += similarity;
                    validKeysCount++;
                }
            });
    
            const averageSimilarity = validKeysCount > 0 ? totalSimilarity / validKeysCount : 0;
    
            return {
                item: item,
                similarity: averageSimilarity
            };
        });
    
        // 유사도에 따라 정렬하고 상위 5개 항목 선택
        similarityScores.sort((a, b) => b.similarity - a.similarity);
        const topFiveSimilarItems = similarityScores.slice(0, 5).map(score => score.item);
    
        return topFiveSimilarItems;
    }
    
    


function cosineSimilarity(vecA, vecB) {

    if (typeof vecA === 'string') vecA = JSON.parse(vecA);
    if (typeof vecB === 'string') vecB = JSON.parse(vecB)

    // dot 함수로 점곱 계산
    const dotProduct = dot(vecA, vecB);

    // norm 함수로 노름 계산
    const normA = norm(vecA);
    const normB = norm(vecB);

    if (normA === 0 || normB === 0) {
        return 0;
    } else {
        return dotProduct / (normA * normB);
    }
}




    return (
        <>
            <View style={{ marginTop: 50 }}>
                <TouchableOpacity style={styles.button} onPress={() => setCurrentScreen('Home')}>
                    <Text style={styles.buttonText}>뒤로 가기</Text>
                </TouchableOpacity>
            </View>
            {/* <View style={{ margin: 20 }}>
                <TouchableOpacity style={styles.button} onPress={fetchAllImagesFromDB}>
                    <Text style={styles.buttonText}>DB 정보 조회</Text>
                </TouchableOpacity>
            </View> */}
            <GiftedChat
                renderBubble={renderBubble}
                style={{ margin: 20, backgroundColor: '#fadd05' }}
                messages={messages}
                onSend={messages => onSend(messages)}
                user={{ _id: 1 }}
            />
        </>
    );
}

// renderAvatar={renderAvatar}
// renderTime={renderTime} 


const styles = StyleSheet.create({
    button: {
        backgroundColor: '#fadd05',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
    },
    buttonText: {
        color: '#211d00',
    },
    // ... 다른 스타일 정의
});

const renderBubble = (props) => {
    return (
        <Bubble
            {...props}
            wrapperStyle={{
                right: {
                    backgroundColor: '#ffea42',
                },
            }}
            textStyle={{
                right: {
                    color: '#211d00',
                },
            }}
        />
    );
};

// const renderAvatar = (props) => {
//     const avatarUrl = "https://i.ibb.co/4j9r1JM/bee.jpg";

//     return (
//         <Avatar
//             {...props}
//             avatarStyle={{ borderRadius: 20, width: '10%', height: '10%' }}
//             source={{ uri: avatarUrl }}
//         />
//     );
// };

// const renderTime = (props) => {
//     return (
//     <Time
//         {...props}
//         textStyle={{
//         right: {
//             color: '#979899', // 오른쪽 메시지 시간의 색상
//         },
//         }}
//     />
//     );
// };