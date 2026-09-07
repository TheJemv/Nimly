import { getThemeColor } from '@/constants/theme';
import { formatUnreadBadge, useTotalUnread } from '@/hooks/useTotalUnread';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  const unreadCount = useTotalUnread();
  const badgeContent = formatUnreadBadge(unreadCount);

  return (
    <NativeTabs
      minimizeBehavior='onScrollDown'
      tintColor={getThemeColor("tabIconDefault")}
    >
      <NativeTabs.Trigger name='(home)'>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          selectedColor={getThemeColor("tabIconSelected")}
          sf={{ default: "house", selected: "house.fill" }}
          drawable='custom_android_drawable'
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='(search)'>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          selectedColor={getThemeColor("tabIconSelected")}
          sf={{ default: "magnifyingglass", selected: "magnifyingglass" }}
          drawable='custom_android_drawable'
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='(messages)'>
        {badgeContent && (
          <NativeTabs.Trigger.Badge>{badgeContent}</NativeTabs.Trigger.Badge>
        )}
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          selectedColor={getThemeColor("tabIconSelected")}
          sf={{ default: "ellipsis.message", selected: "ellipsis.message.fill" }}
          drawable='custom_android_drawable'
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name='(profile)'>
        <NativeTabs.Trigger.Label hidden />
        <NativeTabs.Trigger.Icon
          selectedColor={getThemeColor("tabIconSelected")}
          sf={{ default: "person", selected: "person.fill" }}
          drawable='custom_android_drawable'
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}