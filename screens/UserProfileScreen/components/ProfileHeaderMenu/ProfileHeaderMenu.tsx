import { Button, ContextMenu, Host, Image as SwiftImage } from '@expo/ui/swift-ui';

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
            {/* El key fuerza a React a reinicializar el ContextMenu cuando cambia
                el estado de bloqueo o amistad, ya que @expo/ui/swift-ui no
                siempre refleja cambios de props internamente. */}
            <ContextMenu key={`${iBlockedThem}-${isAccepted}`}>
                <ContextMenu.Items>
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
                </ContextMenu.Items>

                <ContextMenu.Trigger>
                    <SwiftImage systemName="ellipsis" />
                </ContextMenu.Trigger>
            </ContextMenu>
        </Host>
    );
}