// Public interfaces used by the app. FIT SDK 21.178 ships JavaScript only.
declare module "@garmin/fitsdk" {
  export class Stream {
    static fromBuffer(data: Uint8Array): Stream;
  }

  export class Decoder {
    constructor(stream: Stream);
    checkIntegrity(): boolean;
    read(options?: { applyScaleAndOffset?: boolean }): {
      messages: { recordMesgs?: { positionLat?: number; positionLong?: number }[] };
      errors: Error[];
    };
  }

  export class Encoder {
    onMesg(message: number, fields: Record<string, string | number | Date>): void;
    close(): Uint8Array;
  }

  export const Profile: { MesgNum: { FILE_ID: number; RECORD: number } };
}
