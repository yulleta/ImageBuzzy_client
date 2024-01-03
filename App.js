import React, { useState } from 'react';
import { View, Button } from 'react-native';
import HomeScreen from './HomeScreen';
import ChatScreen from './ChatScreen';
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('images.db');

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Home');

  const renderScreen = () => {
    if (currentScreen === 'Home') {
      return <HomeScreen setCurrentScreen={setCurrentScreen} db = {db}/>;
    } else if (currentScreen === 'Chat') {
      return <ChatScreen setCurrentScreen={setCurrentScreen} db = {db} />;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {renderScreen()}
    </View>
  );
}

// HomeScreen.js
// ... HomeScreen 컴포넌트는 props로 setCurrentScreen 함수를 받아야 합니다.
// 예를 들어, 채팅 시작 버튼의 onPress에 setCurrentScreen('Chat')를 호출하도록 합니다.
