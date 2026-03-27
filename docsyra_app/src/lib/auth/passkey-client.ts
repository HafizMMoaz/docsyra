function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export type CreationOptionsJSON = {
  challenge: string;
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  excludeCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
} & Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials">;

export type RequestOptionsJSON = {
  challenge: string;
  allowCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
} & Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials">;

export function parseCreationOptionsFromJSON(options: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToArrayBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((entry) => ({
      ...entry,
      id: base64UrlToArrayBuffer(entry.id),
    })),
  };
}

export function parseRequestOptionsFromJSON(options: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((entry) => ({
      ...entry,
      id: base64UrlToArrayBuffer(entry.id),
    })),
  };
}
