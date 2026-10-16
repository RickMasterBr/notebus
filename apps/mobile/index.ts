import "react-native-gesture-handler";
import { registerRootComponent } from 'expo';

import App from './App';
import { registerNotificationHandlers } from './src/notifications/register';
import { installDiagGlobalHandler, withDiagErrorBoundary } from './src/sheets/DiagErrorBoundary';
import { installNoNetwork } from './src/data/noNetwork';
import { runTestSeedIfNeeded } from './src/db/testSeed';

// O tratador dos botões do aviso vive no escopo do módulo: o iOS acorda o app em segundo plano, sem nenhum Provider
// (E-06 §4). Tem de vir antes de `registerRootComponent`.
registerNotificationHandlers();

// Só com diag (DIAG_SCROLL): mostra o erro na tela em vez de fechar o app (E-09 bloco 18).
installDiagGlobalHandler();

// Bloqueio de rede em testes E2E/Maestro (E-09 §3.4, T-92 a T-94)
installNoNetwork();

// Semeia a rede mínima inventada para testes no simulador (E-09 §3.4, T-92 a T-94)
void runTestSeedIfNeeded();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(withDiagErrorBoundary(App));
