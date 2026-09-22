import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import RegistroScreen from './src/screens/RegistroScreen';
import ReservarScreen from './src/screens/ReservarScreen';
import MisReservasScreen from './src/screens/MisReservasScreen';
import PerfilScreen from './src/screens/PerfilScreen';
import type { AuthStackParamList, MainTabParamList } from './src/navigation/types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
    return (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
            <AuthStack.Screen name="Login" component={LoginScreen} />
            <AuthStack.Screen name="Registro" component={RegistroScreen} />
        </AuthStack.Navigator>
    );
}

function MainNavigator() {
    return (
        <Tab.Navigator
            screenOptions={{
                headerTintColor: '#0d3b66',
                tabBarActiveTintColor: '#c0392b',
                tabBarInactiveTintColor: '#4a4a4a'
            }}
        >
            <Tab.Screen name="Reservar" component={ReservarScreen} options={{ title: 'Reservar Cancha' }} />
            <Tab.Screen name="MisReservas" component={MisReservasScreen} options={{ title: 'Mis Reservas' }} />
            <Tab.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Mi Perfil' }} />
        </Tab.Navigator>
    );
}

function Raiz() {
    const { session, cargando } = useAuth();

    if (cargando) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color="#c0392b" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            {session ? <MainNavigator /> : <AuthNavigator />}
            <StatusBar style="dark" />
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <Raiz />
        </AuthProvider>
    );
}
