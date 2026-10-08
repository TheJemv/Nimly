import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { Ref } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

// Face box is in the view's points (already mapped through the preview's
// aspect-fill). Angles are Vision's head pose, in radians.
export type FaceUpdate =
    | { hasFace: false }
    | {
          hasFace: true;
          x: number;
          y: number;
          width: number;
          height: number;
          yaw: number;
          pitch: number;
          roll: number;
      };

export type FaceScanCameraRef = {
    startRecording(): Promise<void>;
    // Paused stretches are cut out of the clip, not frozen.
    pauseRecording(): Promise<void>;
    resumeRecording(): Promise<void>;
    // Drops the clip and deletes its file.
    cancelRecording(): Promise<void>;
    // Resolves with the mp4's file:// uri.
    stopRecording(): Promise<string>;
};

type FaceScanCameraProps = ViewProps & {
    ref?: Ref<FaceScanCameraRef>;
    onFaceUpdate?: (event: NativeSyntheticEvent<FaceUpdate>) => void;
    onCameraError?: (event: NativeSyntheticEvent<{ message: string }>) => void;
};

// Front camera with Vision face tracking and pausable recording (iOS only).
export const FaceScanCamera = requireNativeView<FaceScanCameraProps>('FaceScan');

// false on app binaries built before this module existed, which an OTA update can
// still reach: the face scan has to stay hidden there.
export const isFaceScanAvailable = requireOptionalNativeModule('FaceScan') != null;
