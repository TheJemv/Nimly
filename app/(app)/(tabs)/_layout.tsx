import { getThemeColor } from '@/constants/theme';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { StyleSheet } from 'react-native';

export default function TabLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <NativeTabs
        minimizeBehavior='onScrollDown'
        tintColor={getThemeColor("tabIconDefault")}
      >
        <NativeTabs.Trigger name='(home)'>
          <NativeTabs.Trigger.Label selectedStyle={styles.selectedLabel}>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon selectedColor={getThemeColor("tabIconSelected")} sf={{ default: "house", selected: "house.fill" }} drawable='custom_android_drawable' />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name='(search)'>
          <NativeTabs.Trigger.Label selectedStyle={styles.selectedLabel}>Search</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon selectedColor={getThemeColor("tabIconSelected")} sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} drawable='custom_android_drawable' />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name='(messages)'>
          <NativeTabs.Trigger.Label selectedStyle={styles.selectedLabel}>Messages</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon selectedColor={getThemeColor("tabIconSelected")} sf={{ default: "ellipsis.message", selected: "ellipsis.message.fill" }} drawable='custom_android_drawable' />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name='(profile)'>
          <NativeTabs.Trigger.Label selectedStyle={styles.selectedLabel}>Profile</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon selectedColor={getThemeColor("tabIconSelected")} sf={{ default: "person", selected: "person.fill" }} drawable='custom_android_drawable' />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  selectedLabel: {
    color: getThemeColor("tabIconSelected")
  },
})