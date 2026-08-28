import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.capitai.app',
  appName: 'Captaí+',
  webDir: 'www',

  server: {
    // A WebView carrega diretamente a aplicacao web existente.
    url: 'https://capitai.io/login/agente',
    cleartext: false,
    // Restringe a navegacao dentro da WebView ao dominio da aplicacao.
    // Qualquer outro host cai no openExternalUrl e abre no navegador do dispositivo.
    allowNavigation: ['capitai.io'],
  },

  ios: {
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    allowMixedContent: false,
  },

  plugins: {
    Camera: {
      // Sem permissoes extras: fotos ficam no cache do app, nao na galeria.
    },

    SplashScreen: {
      // A splash e dispensada pelo proprio Capacitor quando a WebView termina
      // de carregar. Nao dependemos do JS remoto: o bundle publicado em
      // capitai.io/bridge.iife.js ainda e uma versao antiga, sem
      // hideSplash(). Com launchAutoHide: false a splash ficaria presa ate o
      // timeout em toda abertura do app.
      //
      // Quando o bridge novo for publicado no servidor, da para voltar a
      // launchAutoHide: false e deixar a web app chamar
      // window.RootCapitai.hideSplash() no momento exato.
      launchAutoHide: true,
      // Teto de exibicao: em rede lenta a splash sai e a WebView segue
      // carregando por tras, em vez de travar o app numa tela estatica.
      launchShowDuration: 3000,
      launchFadeOutDuration: 200,
      backgroundColor: '#1A0849',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'small',
      iosSpinnerStyle: 'small',
      spinnerColor: '#FFFFFF',
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
};

export default config;
