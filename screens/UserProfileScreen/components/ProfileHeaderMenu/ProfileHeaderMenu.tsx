import { Button, Host, Image as SwiftImage, Menu } from '@expo/ui/swift-ui';

interface ProfileHeaderMenuProps {
    isAccepted: boolean;
    iBlockedThem: boolean;
    onCopyUsername: () => void;
    onReportUser: () => void;
    onSeverConnection: () => void;
    onBlockUser: () => void;
    onUnblockUser: () => void;
}

export default function ProfileHeaderMenu({
    isAccepted,
    iBlockedThem,
    onCopyUsername,
    onReportUser,
    onSeverConnection,
    onBlockUser,
    onUnblockUser,
}: ProfileHeaderMenuProps) {
    return (
        <Host style={{ width: 32, height: 32 }}>
            {/* `Menu` opens on a single tap (like Instagram). `ContextMenu`
                required a long-press and its gesture would often get stuck when
                it raced with the scroll view. The key still forces a re-init of
                the native view when block/friendship state changes. */}
            <Menu
                key={`${iBlockedThem}-${isAccepted}`}
                label={<SwiftImage systemName="ellipsis" />}
            >
                {isAccepted && (
                    <Button systemImage='document.on.document.fill' label='Copy Username' onPress={onCopyUsername} />
                )}
                {!iBlockedThem && (
                    <Button systemImage='person.badge.shield.exclamationmark.fill' label='Report User' onPress={onReportUser} />
                )}
                {isAccepted && (
                    <Button systemImage='person.fill.badge.minus' label='Sever Connection' role='destructive' onPress={onSeverConnection} />
                )}
                {iBlockedThem ? (
                    <Button systemImage='lock.open.fill' label='Unblock User' onPress={onUnblockUser} />
                ) : (
                    <Button systemImage='hand.raised.fill' label='Block User' role='destructive' onPress={onBlockUser} />
                )}
            </Menu>
        </Host>
    );
}
