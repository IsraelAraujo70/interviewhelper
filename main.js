const { app, BrowserWindow, ipcMain, Menu, Tray, desktopCapturer, session } = require('electron');
const path = require('path');
const Store = require('electron-store').default;
const store = new Store();
const fs = require('fs');

// Configurar log para depuração
function log(message) {
  console.log(message);
  fs.appendFileSync('app.log', `${new Date().toISOString()} - ${message}\n`);
}

// Manter uma referência global do objeto da janela
let mainWindow;
let tray = null;

function createWindow() {
  log('Criando janela principal...');
  // Criar a janela do navegador
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: true, // Mostrar ao iniciar
  });

  log('Carregando arquivo HTML...');
  // Carregar o arquivo HTML principal
  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  
  // Garantir que a janela seja visível
  mainWindow.show();
  mainWindow.focus();

  // Configurar manipulador para getDisplayMedia (método preferido para captura de áudio)
  // Isso permite a captura de áudio do sistema sem eco
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    log('Solicitação de getDisplayMedia recebida');
    
    // Obter fontes disponíveis para captura
    desktopCapturer.getSources({ 
      types: ['window', 'screen'],
      thumbnailSize: {
        width: 320,
        height: 180
      },
      fetchWindowIcons: true
    }).then(sources => {
      log(`Encontradas ${sources.length} fontes para captura`);
      
      // Idealmente, apresentaria uma UI para o usuário escolher a fonte
      // Aqui, estamos simplesmente concedendo acesso à primeira fonte
      if (sources.length > 0) {
        // 'loopback' captura apenas o áudio do sistema, não o microfone
        // isso evita o problema de eco
        callback({ 
          video: sources[0],
          audio: 'loopback',
          // Define como false para evitar eco no áudio
          enableLocalEcho: false 
        });
      } else {
        // Se não houver fontes, recusar
        callback(new Error('Nenhuma fonte disponível para captura'));
      }
    }).catch(error => {
      log(`Erro ao obter fontes: ${error}`);
      callback(error);
    });
  }, {
    // Não usar o seletor do sistema, para termos mais controle
    useSystemPicker: false
  });

  // Criar ícone na bandeja do sistema
  tray = new Tray(path.join(__dirname, 'assets/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Abrir Interview Helper', 
      click: () => mainWindow.show() 
    },
    { 
      label: 'Sair', 
      click: () => app.quit() 
    },
  ]);
  tray.setToolTip('Interview Helper');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  // Esconder a janela ao fechar, em vez de encerrar o aplicativo
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Inicializar o aplicativo
app.whenReady().then(() => {
  log('Aplicativo pronto, criando janela...');
  createWindow();

  app.on('activate', function () {
    log('Ativação do aplicativo');
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quando o aplicativo é fechado
app.on('window-all-closed', function () {
  log('Todas as janelas fechadas');
  if (process.platform !== 'darwin') app.quit();
});

// Definir a flag de saída quando o aplicativo está saindo
app.on('before-quit', () => {
  log('Aplicativo encerrando');
  app.isQuitting = true;
});

// Manipulação de eventos de comunicação entre processos (IPC)
ipcMain.on('toggle-visibility', () => {
  log('Toggle de visibilidade');
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
  }
});

ipcMain.on('save-settings', (event, settings) => {
  log('Salvando configurações: ' + JSON.stringify(settings));
  store.set('settings', settings);
  event.reply('settings-saved', true);
});

ipcMain.on('get-settings', (event) => {
  const settings = store.get('settings') || {
    openaiKey: '',
    cv: '',
    company: '',
    jobPosition: ''
  };
  log('Obtendo configurações: ' + JSON.stringify(settings));
  event.reply('settings-loaded', settings);
});

ipcMain.on('minimize-to-tray', () => {
  log('Minimizando para bandeja');
  mainWindow.hide();
});

// Adicionar manipulador para solicitação de desktopCapturer (usado como fallback)
ipcMain.on('request-desktop-capturer', (event) => {
  log('Solicitação recebida para obter fontes do desktopCapturer');
  
  desktopCapturer.getSources({ 
    types: ['window', 'screen'],
    thumbnailSize: {
      width: 320,
      height: 180
    },
    fetchWindowIcons: true
  }).then(sources => {
    log(`Encontradas ${sources.length} fontes para captura`);
    // Enviar as fontes para o processo de renderização
    event.reply('desktop-capturer-sources', sources);
  }).catch(error => {
    log(`Erro ao obter fontes do desktopCapturer: ${error}`);
    event.reply('desktop-capturer-sources', []);
  });
}); 