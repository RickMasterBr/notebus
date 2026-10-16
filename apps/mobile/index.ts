import "react-native-gesture-handler";
import { registerRootComponent } from 'expo';

import App from './App';
import { registerNotificationHandlers } from './src/notifications/register';
import { installDiagGlobalHandler, withDiagErrorBoundary } from './src/sheets/DiagErrorBoundary';

// O tratador dos botões do aviso vive no escopo do módulo: o iOS acorda o app em segundo plano, sem nenhum Provider
// (E-06 §4). Tem de vir antes de `registerRootComponent`.
registerNotificationHandlers();

// Só com diag (DIAG_SCROLL): mostra o erro na tela em vez de fechar o app (E-09 bloco 18).
installDiagGlobalHandler();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(withDiagErrorBoundary(App));
