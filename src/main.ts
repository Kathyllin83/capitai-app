import { installBridge } from './bridge';

// Ponto de entrada do bundle IIFE (bridge.iife.js).
// Ao ser carregado, publica window.RootCapitai e dispara 'rootcapitai:ready'.
installBridge();
