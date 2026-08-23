/**
 * Tipos publicos consumidos pela aplicacao web.
 * Nenhum detalhe de iOS / Android / navegador vaza para fora daqui.
 */

/**
 * De onde a posicao veio.
 *
 *   'capacitor-ios'     -> plugin nativo @capacitor/geolocation no iOS
 *   'capacitor-android' -> plugin nativo @capacitor/geolocation no Android
 *   'browser'           -> navigator.geolocation (fallback web)
 */
export type LocationSource = 'capacitor-ios' | 'capacitor-android' | 'browser';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;

  /** Origem da leitura: plugin nativo ou API do navegador. */
  source: LocationSource;
  /** true quando veio dos plugins nativos do Capacitor. */
  isNative: boolean;
  /**
   * Precisao estimada a partir de `accuracy`, util para exibir ao usuario
   * sem que a interface precise interpretar o valor em metros.
   */
  quality: 'alta' | 'media' | 'baixa';
  /** Altitude em metros, quando o dispositivo informar. */
  altitude: number | null;
  /** true se a posicao veio de cache (maximumAge), nao de leitura nova. */
  cached: boolean;
}

export interface LocationOptions {
  enableHighAccuracy?: boolean;
  /** Timeout em milissegundos. Padrao: 15000. */
  timeout?: number;
  /** Idade maxima aceitavel de uma posicao em cache, em ms. Padrao: 0. */
  maximumAge?: number;
}

export type DeviceErrorCode =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

/**
 * Erro tratado. A interface deve exibir `message`, que ja vem
 * em portugues e legivel para o usuario final.
 * Erros nativos crus nunca chegam ate a aplicacao.
 */
export class DeviceError extends Error {
  readonly code: DeviceErrorCode;
  readonly cause?: unknown;

  constructor(code: DeviceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DeviceError';
    this.code = code;
    this.cause = cause;
  }
}

export interface PermissionStatus {
  camera: boolean;
  location: boolean;
}
