import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import {
  DeviceError,
  type DeviceErrorCode,
  type DeviceLocation,
  type LocationOptions,
  type LocationSource,
  type PermissionStatus,
} from '../types/device';

const DEFAULT_TIMEOUT = 15000;

const MSG_LOCATION_DENIED =
  'É necessário permitir o acesso à localização para continuar.';
const MSG_CAMERA_DENIED =
  'É necessário permitir o acesso à câmera para continuar.';
const MSG_LOCATION_UNAVAILABLE =
  'Não foi possível obter sua localização. Verifique se o GPS está ativado e tente novamente.';
const MSG_LOCATION_TIMEOUT =
  'A busca pela localização demorou demais. Tente novamente em um local aberto.';
const MSG_CAMERA_UNSUPPORTED =
  'Este dispositivo ou navegador não oferece suporte à câmera.';
const MSG_LOCATION_UNSUPPORTED =
  'Este dispositivo ou navegador não oferece suporte à geolocalização.';

/**
 * Camada unica de acesso a recursos nativos.
 *
 *   App iOS/Android -> Capacitor (Geolocation / Camera) -> recurso nativo
 *   Navegador       -> navigator.geolocation / <input type="file">
 *
 * A aplicacao web consome sempre a mesma API, sem saber onde esta rodando.
 */
export class DeviceService {
  /** true quando rodando dentro do app nativo (iOS/Android). */
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /** 'ios' | 'android' | 'web' */
  getPlatform(): string {
    return Capacitor.getPlatform();
  }

  /**
   * Solicita antecipadamente as permissoes de camera e localizacao.
   * Nao lanca: retorna o estado de cada permissao para a interface decidir.
   * No navegador as permissoes sao pedidas apenas no momento do uso,
   * entao aqui reportamos ambas como concedidas.
   */
  async requestPermissions(): Promise<PermissionStatus> {
    if (!this.isNative()) {
      return { camera: true, location: true };
    }

    const [location, camera] = await Promise.all([
      this.requestLocationPermission(),
      this.requestCameraPermission(),
    ]);

    return { camera, location };
  }

  // ----------------------------------------------------------------
  // Geolocalizacao
  // ----------------------------------------------------------------

  /**
   * Retorna a posicao atual do dispositivo.
   * @throws {DeviceError} sempre tratado, com mensagem exibivel ao usuario.
   */
  async getCurrentLocation(options: LocationOptions = {}): Promise<DeviceLocation> {
    const enableHighAccuracy = options.enableHighAccuracy ?? true;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    const maximumAge = options.maximumAge ?? 0;

    return this.isNative()
      ? this.getNativeLocation({ enableHighAccuracy, timeout, maximumAge })
      : this.getBrowserLocation({ enableHighAccuracy, timeout, maximumAge });
  }

  private async getNativeLocation(
    options: Required<LocationOptions>,
  ): Promise<DeviceLocation> {
    const granted = await this.requestLocationPermission();
    if (!granted) {
      throw new DeviceError('PERMISSION_DENIED', MSG_LOCATION_DENIED);
    }

    try {
      const requestedAt = Date.now();

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge,
      });

      const platform = this.getPlatform();
      const source: LocationSource =
        platform === 'ios' ? 'capacitor-ios' : 'capacitor-android';

      return this.buildLocation(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? null,
          timestamp: position.timestamp,
        },
        source,
        requestedAt,
      );
    } catch (error) {
      throw this.toLocationError(error);
    }
  }

  private getBrowserLocation(
    options: Required<LocationOptions>,
  ): Promise<DeviceLocation> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return Promise.reject(
        new DeviceError('UNSUPPORTED', MSG_LOCATION_UNSUPPORTED),
      );
    }

    const requestedAt = Date.now();

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve(
            this.buildLocation(
              {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude ?? null,
                timestamp: position.timestamp,
              },
              'browser',
              requestedAt,
            ),
          ),
        (error) => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(new DeviceError('PERMISSION_DENIED', MSG_LOCATION_DENIED, error));
              break;
            case error.POSITION_UNAVAILABLE:
              reject(
                new DeviceError('POSITION_UNAVAILABLE', MSG_LOCATION_UNAVAILABLE, error),
              );
              break;
            case error.TIMEOUT:
              reject(new DeviceError('TIMEOUT', MSG_LOCATION_TIMEOUT, error));
              break;
            default:
              reject(new DeviceError('UNKNOWN', MSG_LOCATION_UNAVAILABLE, error));
          }
        },
        {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: options.maximumAge,
        },
      );
    });
  }

  /**
   * Monta o DeviceLocation final a partir dos dados crus, anexando a origem
   * da leitura. Ponto unico onde `source`, `quality` e `cached` sao derivados.
   */
  private buildLocation(
    raw: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number | null;
      timestamp: number;
    },
    source: LocationSource,
    requestedAt: number,
  ): DeviceLocation {
    // Uma posicao anterior ao inicio da chamada veio do cache do sistema.
    const cached = raw.timestamp > 0 && raw.timestamp < requestedAt - 1000;

    return {
      latitude: raw.latitude,
      longitude: raw.longitude,
      accuracy: raw.accuracy,
      timestamp: raw.timestamp,
      altitude: raw.altitude,
      source,
      isNative: source !== 'browser',
      quality: this.accuracyToQuality(raw.accuracy),
      cached,
    };
  }

  /** Traduz `accuracy` (metros) em um rotulo exibivel. */
  private accuracyToQuality(accuracy: number): 'alta' | 'media' | 'baixa' {
    if (!Number.isFinite(accuracy) || accuracy <= 0) return 'baixa';
    if (accuracy <= 20) return 'alta';
    if (accuracy <= 100) return 'media';
    return 'baixa';
  }

  private async requestLocationPermission(): Promise<boolean> {
    try {
      let status = await Geolocation.checkPermissions();

      if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
        status = await Geolocation.requestPermissions({ permissions: ['location'] });
      }

      return status.location === 'granted';
    } catch {
      return false;
    }
  }

  /** Traduz erros do plugin nativo de geolocalizacao para DeviceError. */
  private toLocationError(error: unknown): DeviceError {
    const raw = (error as { message?: string })?.message ?? '';
    const message = raw.toLowerCase();

    let code: DeviceErrorCode = 'POSITION_UNAVAILABLE';
    let friendly = MSG_LOCATION_UNAVAILABLE;

    if (message.includes('denied') || message.includes('permission')) {
      code = 'PERMISSION_DENIED';
      friendly = MSG_LOCATION_DENIED;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      code = 'TIMEOUT';
      friendly = MSG_LOCATION_TIMEOUT;
    }

    return new DeviceError(code, friendly, error);
  }

  // ----------------------------------------------------------------
  // Camera
  // ----------------------------------------------------------------

  /**
   * Abre a camera e devolve a foto como File, pronto para FormData.
   *
   * No nativo usamos CameraResultType.Uri + fetch(webPath) em vez de Base64:
   * evita carregar a imagem inteira como string na memoria.
   *
   * @throws {DeviceError} sempre tratado, com mensagem exibivel ao usuario.
   */
  async takePhoto(): Promise<File> {
    return this.isNative() ? this.takeNativePhoto() : this.takeBrowserPhoto();
  }

  private async takeNativePhoto(): Promise<File> {
    const granted = await this.requestCameraPermission();
    if (!granted) {
      throw new DeviceError('PERMISSION_DENIED', MSG_CAMERA_DENIED);
    }

    let webPath: string | undefined;
    let format = 'jpeg';

    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: false,
        correctOrientation: true,
      });

      webPath = photo.webPath;
      format = photo.format || 'jpeg';
    } catch (error) {
      throw this.toCameraError(error);
    }

    if (!webPath) {
      throw new DeviceError('UNKNOWN', 'Não foi possível processar a foto capturada.');
    }

    try {
      // webPath e uma URL local servida pela WebView; o fetch le o arquivo
      // como binario, sem passar por Base64.
      const response = await fetch(webPath);
      const blob = await response.blob();
      const type = blob.type || `image/${format}`;

      return new File([blob], `foto-${Date.now()}.${format}`, {
        type,
        lastModified: Date.now(),
      });
    } catch (error) {
      throw new DeviceError(
        'UNKNOWN',
        'Não foi possível processar a foto capturada.',
        error,
      );
    }
  }

  /**
   * Fallback web: <input type="file" accept="image/*" capture="environment">.
   * No celular abre a camera; no desktop abre o seletor de arquivos.
   */
  private takeBrowserPhoto(): Promise<File> {
    if (typeof document === 'undefined') {
      return Promise.reject(new DeviceError('UNSUPPORTED', MSG_CAMERA_UNSUPPORTED));
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
      input.style.display = 'none';

      let settled = false;

      const cleanup = () => {
        window.removeEventListener('focus', onFocus);
        input.remove();
      };

      const onChange = () => {
        if (settled) return;
        const file = input.files?.[0];
        settled = true;
        cleanup();

        if (file) {
          resolve(file);
        } else {
          reject(new DeviceError('CANCELLED', 'Nenhuma foto foi selecionada.'));
        }
      };

      // Cancelar o seletor nao dispara 'change' em todos os navegadores.
      // O retorno do foco a janela e o sinal mais confiavel de cancelamento.
      const onFocus = () => {
        setTimeout(() => {
          if (settled) return;
          if (!input.files || input.files.length === 0) {
            settled = true;
            cleanup();
            reject(new DeviceError('CANCELLED', 'Nenhuma foto foi selecionada.'));
          }
        }, 500);
      };

      input.addEventListener('change', onChange);
      input.addEventListener('cancel', onChange);
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  private async requestCameraPermission(): Promise<boolean> {
    try {
      let status = await Camera.checkPermissions();

      if (status.camera === 'prompt' || status.camera === 'prompt-with-rationale') {
        status = await Camera.requestPermissions({ permissions: ['camera'] });
      }

      return status.camera === 'granted' || status.camera === 'limited';
    } catch {
      return false;
    }
  }

  /** Traduz erros do plugin nativo de camera para DeviceError. */
  private toCameraError(error: unknown): DeviceError {
    const raw = (error as { message?: string })?.message ?? '';
    const message = raw.toLowerCase();

    if (message.includes('cancel')) {
      return new DeviceError('CANCELLED', 'Captura de foto cancelada.', error);
    }

    if (message.includes('denied') || message.includes('permission')) {
      return new DeviceError('PERMISSION_DENIED', MSG_CAMERA_DENIED, error);
    }

    if (message.includes('not available') || message.includes('unavailable')) {
      return new DeviceError('UNSUPPORTED', MSG_CAMERA_UNSUPPORTED, error);
    }

    return new DeviceError('UNKNOWN', 'Não foi possível capturar a foto.', error);
  }
}

/** Instancia unica compartilhada. */
export const deviceService = new DeviceService();
