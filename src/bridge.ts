import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

import { deviceService } from './services/DeviceService';
import { DeviceError } from './types/device';

const APP_HOST = 'rl55.capitai.io';

/**
 * Expoe o DeviceService no `window` para que a aplicacao web carregada
 * na WebView possa chama-lo diretamente:
 *
 *   const loc = await window.RootCapitai.getCurrentLocation({ enableHighAccuracy: true });
 *   const photo = await window.RootCapitai.takePhoto();
 *
 * `isNative` permite a aplicacao decidir se usa a ponte nativa
 * ou seus proprios fallbacks web.
 */
export interface RootCapitaiBridge {
  isNative: () => boolean;
  getPlatform: () => string;
  requestPermissions: typeof deviceService.requestPermissions;
  getCurrentLocation: typeof deviceService.getCurrentLocation;
  takePhoto: typeof deviceService.takePhoto;
  openExternal: (url: string) => Promise<void>;
  hideSplash: () => Promise<void>;
  version: string;
}

declare global {
  interface Window {
    RootCapitai?: RootCapitaiBridge;
    Capacitor?: unknown;
  }
}

/** Abre uma URL fora da WebView, no navegador/app do dispositivo. */
async function openExternal(url: string): Promise<void> {
  await Browser.open({ url });
}

/**
 * Intercepta cliques em links que apontam para fora do dominio da aplicacao
 * e os abre no navegador externo. A WebView nunca vira um navegador generico.
 *
 * Esquemas nao-http (whatsapp:, tel:, mailto:, geo:, comgooglemaps:) sao
 * entregues ao sistema operacional, que abre o app correspondente.
 */
function interceptExternalLinks(): void {
  document.addEventListener(
    'click',
    (event) => {
      const target = (event.target as HTMLElement | null)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url: URL;
      try {
        url = new URL(href, document.baseURI);
      } catch {
        return;
      }

      const isHttp = url.protocol === 'http:' || url.protocol === 'https:';

      // Esquemas de app (whatsapp:, tel:, mailto:, ...) -> sistema operacional.
      if (!isHttp) {
        event.preventDefault();
        window.open(url.href, '_system');
        return;
      }

      // Mesmo dominio -> navega normalmente dentro da WebView.
      if (url.hostname === APP_HOST) return;

      // Qualquer outro host -> navegador externo.
      event.preventDefault();
      void openExternal(url.href);
    },
    true,
  );
}

/**
 * Esconde a splash nativa. Como `launchAutoHide` e false, a splash so sai
 * quando a aplicacao web ja pintou seu primeiro frame — nunca ha um flash
 * branco entre a splash e o conteudo remoto.
 *
 * A aplicacao web pode chamar `window.RootCapitai.hideSplash()` para controlar
 * o momento exato (por exemplo, apos hidratar a tela de login). Se ela nao
 * chamar, o fallback abaixo cuida disso no `load` da pagina.
 */
let splashHidden = false;

async function hideSplash(): Promise<void> {
  if (splashHidden || !Capacitor.isNativePlatform()) return;
  splashHidden = true;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    // Plugin indisponivel: nada a fazer, a splash sai pelo launchShowDuration.
  }
}

/**
 * Dispensa a splash assim que a pagina remota terminar de carregar.
 * `requestAnimationFrame` duplo garante que o primeiro frame ja foi pintado.
 */
function scheduleSplashHide(): void {
  const run = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => void hideSplash()));

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }
}

/** Instala a ponte. Chamado no boot do shell nativo. */
export function installBridge(): void {
  const bridge: RootCapitaiBridge = {
    isNative: () => deviceService.isNative(),
    getPlatform: () => deviceService.getPlatform(),
    requestPermissions: () => deviceService.requestPermissions(),
    getCurrentLocation: (options) => deviceService.getCurrentLocation(options),
    takePhoto: () => deviceService.takePhoto(),
    openExternal,
    hideSplash,
    version: '1.0.0',
  };

  window.RootCapitai = bridge;

  if (Capacitor.isNativePlatform()) {
    interceptExternalLinks();
    scheduleSplashHide();

    // Botao voltar do Android: volta no historico da aplicacao web;
    // na primeira tela, minimiza o app em vez de fecha-lo.
    void App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.minimizeApp();
      }
    });
  }

  window.dispatchEvent(new CustomEvent('rootcapitai:ready', { detail: bridge }));
}

export { deviceService, DeviceError };
