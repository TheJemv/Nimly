import { getThemeColor } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/utils/debounce';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect, useState } from 'react';

export default function TabLayout() {
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    let channel: any;
    let cancelled = false;

    const fetchTotalUnread = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // Mensajes no leídos que no envié yo (RLS ya limita a mis chats).
        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .neq('sender_id', user.id)
          .eq('is_read', false);

        if (error) throw error;
        if (!cancelled) setUnreadCount(count || 0);
      } catch (e) {
        console.error("❌ [TABS_BADGE] Error fetching unread count:", e);
      }
    };

    // Colapsa ráfagas de eventos realtime en un solo refetch.
    const debouncedRefetch = debounce(fetchTotalUnread, 800);

    fetchTotalUnread();

    channel = supabase
      .channel(`global_unread_badge_${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => debouncedRefetch()
      )
      .subscribe();

    return () => {
      cancelled = true;
      debouncedRefetch.cancel();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Formatear el string del Badge al estilo clásico de iOS (ej. "9+")
  const renderBadgeValue = () => {
    if (unreadCount === 0) return null;
    return unreadCount > 9 ? '9+' : `${unreadCount}`;
  };

  const badgeContent = renderBadgeValue();

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