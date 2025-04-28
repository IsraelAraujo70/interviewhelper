// Comunicação IPC com o processo principal
const { ipcRenderer } = require('electron');

// Elementos do DOM
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const saveSettingsButton = document.getElementById('save-settings');
const testAudioButton = document.getElementById('test-audio');
const startInterviewButton = document.getElementById('start-interview');
const pauseInterviewButton = document.getElementById('pause-interview');
const stopInterviewButton = document.getElementById('stop-interview');
const micSelect = document.getElementById('mic-select');
const systemAudioSelect = document.getElementById('system-audio');
const openaiKeyInput = document.getElementById('openai-key');
const companyNameInput = document.getElementById('company-name');
const jobPositionInput = document.getElementById('job-position');
const cvTextArea = document.getElementById('cv-text');
const unifiedChatDiv = document.getElementById('unified-chat');
const statusText = document.getElementById('status-text');
const companyDisplay = document.getElementById('company-display');
const positionDisplay = document.getElementById('position-display');
const debugModeToggle = document.getElementById('debug-mode');
const languageSelect = document.getElementById('language-select');
const minimizeWindowButton = document.getElementById('minimize-window');
const closeWindowButton = document.getElementById('close-window');

// Variáveis globais
let mediaRecorder = null;
let recordingInterval = null;
let isRecording = false;
let speechRecognition = null;
let audioContext = null;
let settingsTab = null;
let audioChunks = [];
let transcription = '';
// Ativar modo debug por padrão para ajudar na resolução do problema
let isDebugMode = true;

// Variáveis para controle de requisições repetidas
let lastRequestTime = 0;
const REQUEST_COOLDOWN = 5000; // 5 segundos entre solicitações

// Configurações do usuário
let settings = {
    openaiKey: '',
    cv: '',
    company: '',
    jobPosition: '',
    userDevice: 'default',
    systemDevice: 'system',
    language: 'pt-BR'
};

// --------------------------------
// Funções de inicialização
// --------------------------------

// Carregar configurações salvas
function loadSettings() {
    ipcRenderer.send('get-settings');
}

// Obter dispositivos de áudio disponíveis
async function getAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        // Limpar selects
        micSelect.innerHTML = '';
        systemAudioSelect.innerHTML = '';
        
        // Adicionar opções para microfones
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microfone ${micSelect.options.length + 1}`;
            micSelect.appendChild(option);
        });
        
        // Adicionar opções para áudio do sistema
        // Em ambientes reais, o áudio do sistema requer permissões especiais
        const systemOption = document.createElement('option');
        systemOption.value = 'system';
        systemOption.text = 'Áudio do Sistema';
        systemAudioSelect.appendChild(systemOption);
        
    } catch (error) {
        console.error('Erro ao obter dispositivos de áudio:', error);
    }
}

// --------------------------------
// Funções de interação com a UI
// --------------------------------

// Alternar entre abas
function switchTab(tabId) {
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
}

// Atualizar UI com configurações
function updateUIWithSettings() {
    openaiKeyInput.value = settings.openaiKey || '';
    companyNameInput.value = settings.company || '';
    jobPositionInput.value = settings.jobPosition || '';
    cvTextArea.value = settings.cv || '';
    languageSelect.value = settings.language || 'pt-BR';
    
    companyDisplay.textContent = settings.company || 'Não definido';
    positionDisplay.textContent = settings.jobPosition || 'Não definido';
}

// Adicionar mensagem na transcrição
function addTranscription(text, isUser = true) {
    const messageElement = document.createElement('p');
    messageElement.classList.add(isUser ? 'user-message' : 'interviewer-message');
    messageElement.innerHTML = `<strong>${isUser ? 'Você' : 'Entrevistador'}:</strong> ${text}`;
    unifiedChatDiv.appendChild(messageElement);
    
    // Garantir que a rolagem automática funcione
    setTimeout(() => {
        unifiedChatDiv.scrollTop = unifiedChatDiv.scrollHeight;
    }, 100);
    
    // Armazenar para contexto da IA
    transcription += `${isUser ? 'Candidato' : 'Entrevistador'}: ${text}\n`;
}

// Adicionar sugestão da IA
function addSuggestion(text) {
    const suggestionElement = document.createElement('div');
    suggestionElement.classList.add('ai-suggestion');
    
    // Processar texto como markdown
    // Vamos adicionar formatação básica para tornar as sugestões mais legíveis
    const formattedText = parseSuggestionMarkdown(text);
    suggestionElement.innerHTML = `<strong>Sugestão de Resposta:</strong><br>${formattedText}`;
    
    unifiedChatDiv.appendChild(suggestionElement);
    
    // Garantir que a rolagem automática funcione
    setTimeout(() => {
        unifiedChatDiv.scrollTop = unifiedChatDiv.scrollHeight;
    }, 100);
}

// Função para processar markdown simples nas sugestões
function parseSuggestionMarkdown(text) {
    // Substituir quebras de linha por tags <br>
    let formatted = text.replace(/\n/g, '<br>');
    
    // Formatação para negrito: **texto** ou __texto__
    formatted = formatted.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');
    
    // Formatação para itálico: *texto* ou _texto_
    formatted = formatted.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
    
    // Formatação para código inline: `texto`
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Formatação para blocos de código: ```código```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Formatação para títulos: # Título
    formatted = formatted.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    formatted = formatted.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    formatted = formatted.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    
    // Formatação para listas: - item
    formatted = formatted.replace(/^- (.*?)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
    
    return formatted;
}

// Atualizar estado dos botões
function updateButtonStates(recording) {
    startInterviewButton.disabled = recording;
    pauseInterviewButton.disabled = !recording;
    stopInterviewButton.disabled = !recording;
}

// --------------------------------
// Funções de áudio e IA
// --------------------------------

// Iniciar gravação
async function startRecording() {
    try {
        console.log("[DEBUG] Iniciando gravação de áudio...");
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Detectar o sistema operacional
        const isLinux = navigator.userAgent.indexOf("Linux") !== -1;
        console.log(`[DEBUG] Sistema operacional: ${isLinux ? 'Linux' : 'Não Linux'}`);
        
        // Verificar se já fizemos uma solicitação recentemente (evitar spam de solicitações)
        const now = Date.now();
        if (now - lastRequestTime < REQUEST_COOLDOWN) {
            console.log("[DEBUG] Aguardando cooldown entre solicitações...");
            statusText.textContent = 'Processando solicitação anterior...';
            return false;
        }
        
        lastRequestTime = now;
        
        if (isLinux) {
            // No Linux, vamos direto para o método do desktopCapturer para evitar o diálogo de seleção
            console.log("[DEBUG] Usando método desktopCapturer no Linux");
            statusText.textContent = 'Solicitando permissões...';
            ipcRenderer.send('request-desktop-capturer');
            return true;
        }
        
        // Usar getDisplayMedia para capturar áudio do sistema sem eco
        // Esta API é mais moderna e tem melhor tratamento de áudio
        console.log("[DEBUG] Solicitando acesso ao áudio do sistema com getDisplayMedia");
        
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
                // Usar 'loopback' permite capturar apenas o áudio do sistema
                // sem capturar o microfone, evitando o problema de eco
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                width: 1,
                height: 1,
                frameRate: 1
            }
        });
        
        // Verificar se temos faixas de áudio
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.error("[ERRO] Nenhuma faixa de áudio encontrada no stream");
            throw new Error("Nenhuma faixa de áudio encontrada");
        }
        
        console.log(`[DEBUG] Faixa de áudio obtida: ${audioTracks[0].label}`);
        
        // Remover a faixa de vídeo, pois só precisamos do áudio
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach(track => track.stop());
        videoTracks.forEach(track => stream.removeTrack(track));
        
        // Configurar analisador de áudio para visualização
        if (isDebugMode) {
            setupAudioAnalyzer(stream);
        }
        
        // Não iniciamos o reconhecimento de fala contínuo
        // pois não queremos capturar o áudio do usuário
        
        // Verificar os tipos MIME suportados
        const supportedMimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        
        // Encontrar o primeiro tipo MIME suportado
        const mimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
        console.log(`[DEBUG] Usando tipo MIME: ${mimeType} para gravação`);
        
        // Configuração do MediaRecorder com opções aprimoradas
        const recorderOptions = {
            mimeType: mimeType,
            audioBitsPerSecond: 128000 // 128kbps é uma boa qualidade para voz
        };
        
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                if (isDebugMode) {
                    console.log(`[DEBUG] Chunk de áudio recebido: ${event.data.size} bytes, tipo: ${event.data.type}`);
                }
            }
        };
        
        mediaRecorder.onstop = processAudioData;
        
        mediaRecorder.start(1000); // Capturar em chunks menores (a cada 1 segundo)
        isRecording = true;
        updateButtonStates(true);
        statusText.textContent = 'Gravando (apenas áudio do sistema)';
        statusText.classList.add('text-success');
        
        // Processar áudio em intervalos para obter feedback contínuo
        recordingInterval = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
                if (isDebugMode) {
                    console.log("[DEBUG] Solicitando dados do MediaRecorder");
                }
            }
        }, 3000); // A cada 3 segundos
        
        // Adicionar elemento de debug se estiver no modo debug
        if (isDebugMode) {
            addDebugPanel();
        }
        
        return true;
    } catch (error) {
        console.error('[ERRO] Falha ao iniciar gravação:', error);
        statusText.textContent = 'Erro ao iniciar gravação';
        statusText.classList.add('text-danger');
        
        // Fallback para o método antigo se getDisplayMedia falhar
        try {
            console.log("[DEBUG] Tentando método alternativo para gravação...");
            
            // Solicitar permissão do desktopCapturer via IPC
            ipcRenderer.send('request-desktop-capturer');
            
            return false;
        } catch (fallbackError) {
            console.error('[ERRO] Falha também no método alternativo:', fallbackError);
            return false;
        }
    }
}

// Configurar analisador de áudio
function setupAudioAnalyzer(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Atualizar visualização do volume
    function updateVolumeVisualization() {
        if (!isRecording) return;
        
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        
        // Atualizar o elemento de visualização de volume
        const volumeBar = document.getElementById('volume-meter');
        if (volumeBar) {
            volumeBar.style.width = `${average}%`;
            volumeBar.textContent = `${Math.round(average)}%`;
            
            // Mudar cor baseado no volume
            if (average < 30) {
                volumeBar.style.backgroundColor = '#dc3545'; // Vermelho - volume baixo
            } else if (average < 70) {
                volumeBar.style.backgroundColor = '#ffc107'; // Amarelo - volume médio
            } else {
                volumeBar.style.backgroundColor = '#28a745'; // Verde - volume bom
            }
        }
        
        requestAnimationFrame(updateVolumeVisualization);
    }
    
    updateVolumeVisualization();
}

// Adicionar painel de debug
function addDebugPanel() {
    // Verificar se já existe
    if (document.getElementById('debug-panel')) return;
    
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.classList.add('debug-panel');
    debugPanel.innerHTML = `
        <h3>Modo Debug</h3>
        <div class="debug-item">
            <label>Nível de Volume:</label>
            <div class="volume-container">
                <div id="volume-meter" class="volume-meter">0%</div>
            </div>
        </div>
        <div class="debug-item">
            <label>Dados de Áudio Brutos:</label>
            <pre id="raw-audio-data" class="raw-data"></pre>
        </div>
        <div class="debug-item">
            <label>Transcrição Atual:</label>
            <pre id="current-transcript" class="transcript-data"></pre>
        </div>
    `;
    
    // Adicionar após o chat unificado
    document.querySelector('.unified-chat-container').after(debugPanel);
}

// Obter transcrição do áudio usando API do Whisper
async function getTranscription(audioBlob) {
    console.log("[DEBUG] Iniciando processo de transcrição...");
    console.log(`[DEBUG] Informações do Blob: tamanho=${audioBlob.size}, tipo=${audioBlob.type}`);
    
    if (!settings.openaiKey) {
        console.error("[ERRO] Chave da API OpenAI não configurada");
        return null;
    }
    
    console.log(`[DEBUG] Utilizando chave da API: ${settings.openaiKey.substring(0, 10)}...`);
    
    try {
        console.log("[DEBUG] Iniciando tentativa de transcrição com API Whisper");
        
        // Primeiro tentar usar a API OpenAI Whisper diretamente
        try {
            console.log("[DEBUG] Preparando FormData para envio à API...");
            
            // Criar um FormData para enviar o arquivo
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-1');
            formData.append('language', settings.language.split('-')[0]); // Usar apenas o código do idioma (pt, en, es, etc)
            
            console.log("[DEBUG] FormData preparado, enviando para a API...");
            
            // Enviar para a API da OpenAI
            console.log("[DEBUG] Enviando requisição para https://api.openai.com/v1/audio/transcriptions");
            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${settings.openaiKey}`,
                },
                body: formData
            });
            
            console.log(`[DEBUG] Resposta da API recebida, status: ${response.status}`);
            
            if (!response.ok) {
                console.error(`[ERRO] API retornou status ${response.status}`);
                const errorText = await response.text();
                console.error("[ERRO] Resposta da API:", errorText);
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText };
                }
                console.error("[ERRO] Detalhes do erro:", errorData);
                throw new Error(`API retornou status ${response.status}: ${errorText}`);
            }
            
            console.log("[DEBUG] Processando resposta da API...");
            const data = await response.json();
            console.log("[DEBUG] Resposta da API OpenAI:", data);
            
            if (data.text) {
                console.log(`[DEBUG] Transcrição bem-sucedida: "${data.text}"`);
                return data.text;
            }
            
            console.error("[ERRO] Resposta da API não contém texto:", data);
            throw new Error("Resposta da API não contém texto");
        } catch (apiError) {
            console.error("[ERRO] Falha na chamada da API OpenAI:", apiError);
            
            // Fallback para o SpeechRecognition se a API falhar
            console.log("[DEBUG] Tentando fallback para SpeechRecognition...");
            if (window.webkitSpeechRecognition || window.SpeechRecognition) {
                try {
                    // Usar a API SpeechRecognition do navegador quando disponível
                    console.log("[DEBUG] Fallback: Iniciando SpeechRecognition do navegador");
                    
                    // Criar reconhecedor de fala
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    const recognition = new SpeechRecognition();
                    recognition.lang = 'pt-BR';
                    recognition.continuous = false;
                    recognition.interimResults = false;
                    
                    return new Promise((resolve) => {
                        let recognizedText = '';
                        
                        recognition.onresult = (event) => {
                            const transcript = event.results[0][0].transcript;
                            recognizedText = transcript;
                            console.log("[DEBUG] Texto reconhecido pelo navegador:", transcript);
                        };
                        
                        recognition.onerror = (event) => {
                            console.error("[ERRO] Erro no reconhecimento de fala:", event.error);
                        };
                        
                        recognition.onend = () => {
                            if (recognizedText) {
                                console.log(`[DEBUG] SpeechRecognition bem-sucedido: "${recognizedText}"`);
                                resolve(recognizedText);
                            } else {
                                // Se falhar, recorrer à simulação como último recurso
                                console.log("[DEBUG] SpeechRecognition falhou, usando simulação como último recurso");
                                resolve(getSimulatedTranscription());
                            }
                        };
                        
                        console.log("[DEBUG] Iniciando SpeechRecognition...");
                        recognition.start();
                    });
                } catch (speechError) {
                    console.error("[ERRO] Falha no SpeechRecognition:", speechError);
                    // Fallback para simulação se tudo falhar
                    console.log("[DEBUG] Fallback para simulação devido a erro no SpeechRecognition");
                    return getSimulatedTranscription();
                }
            } else {
                // Fallback se a API SpeechRecognition não estiver disponível
                console.log("[DEBUG] SpeechRecognition não disponível, usando simulação");
                return getSimulatedTranscription();
            }
        }
    } catch (error) {
        console.error("[ERRO] Falha geral na transcrição:", error);
        return null;
    }
}

// Função auxiliar para gerar transcrição simulada
function getSimulatedTranscription() {
    console.log("[DEBUG] *** USANDO TRANSCRIÇÃO SIMULADA ***");
    
    // Frases comuns em entrevistas para simulação
    const possibleResponses = [
        "[SIMULAÇÃO] Onde você se vê em 5 anos?",
        "[SIMULAÇÃO] Me conte sobre sua experiência profissional.",
        "[SIMULAÇÃO] Quais são suas principais habilidades técnicas?",
        "[SIMULAÇÃO] Como você lidaria com um conflito na equipe?",
        "[SIMULAÇÃO] Descreva um projeto desafiador que você trabalhou.",
        "[SIMULAÇÃO] Qual é o seu conhecimento em React e Node.js?",
        "[SIMULAÇÃO] Você tem experiência com metodologias ágeis?",
        "[SIMULAÇÃO] Como você mantém-se atualizado com as novas tecnologias?",
        "[SIMULAÇÃO] Qual foi seu maior desafio técnico e como você o superou?",
        "[SIMULAÇÃO] Você prefere trabalhar sozinho ou em equipe?"
    ];
    
    // Escolher uma resposta aleatória
    const response = possibleResponses[Math.floor(Math.random() * possibleResponses.length)];
    console.log("[DEBUG] Texto de transcrição simulada:", response);
    return response;
}

// Processar dados de áudio e enviar para transcrição
async function processAudioData() {
    if (audioChunks.length === 0) return;
    
    try {
        // Obter o tipo MIME dos chunks (usando o primeiro chunk como referência)
        const mimeType = audioChunks[0].type || 'audio/webm';
        console.log(`[DEBUG] Tipo MIME do áudio capturado: ${mimeType}`);
        
        // Criar blob com o tipo MIME detectado
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        
        if (isDebugMode) {
            console.log(`[DEBUG] Processando blob de áudio: ${audioBlob.size} bytes, tipo: ${audioBlob.type}`);
            
            // Mostrar dados de áudio no painel de debug
            const rawDataElem = document.getElementById('raw-audio-data');
            if (rawDataElem) {
                rawDataElem.textContent = `Tamanho: ${audioBlob.size} bytes\nTipo: ${audioBlob.type}\nÚltima atualização: ${new Date().toLocaleTimeString()}`;
            }
        }
        
        // Verificar se o blob tem tamanho válido
        if (audioBlob.size < 100) {
            console.error("[ERRO] Blob de áudio muito pequeno, provavelmente inválido");
            throw new Error("Blob de áudio inválido ou vazio");
        }
        
        // Criar uma URL temporária para o áudio (útil para depuração)
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log("[DEBUG] Áudio gravado disponível em:", audioUrl);
        
        // Verificar se o formato é compatível com a API Whisper
        const supportedFormats = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/wav', 'audio/x-wav', 'audio/ogg'];
        const isFormatSupported = supportedFormats.some(format => mimeType.includes(format));
        
        if (!isFormatSupported) {
            console.warn(`[AVISO] Formato ${mimeType} pode não ser suportado pela API Whisper. Tentando mesmo assim.`);
        }
        
        // Usar a transcrição real
        const transcriptionText = await getTranscription(audioBlob);
        
        if (transcriptionText) {
            console.log("[DEBUG] Texto transcrito:", transcriptionText);
            
            // Determinar se é o entrevistador falando
            // Esta lógica precisaria ser mais sofisticada em um app real
            const isInterviewer = true; // Consideramos tudo como entrevistador já que só capturamos áudio do sistema
            
            // Atualizar o painel de debug
            if (isDebugMode) {
                const transcriptElem = document.getElementById('current-transcript');
                if (transcriptElem) {
                    transcriptElem.textContent = `[${new Date().toLocaleTimeString()}] ENTREVISTADOR: ${transcriptionText}`;
                }
            }
            
            // Adicionar a transcrição sempre como fala do entrevistador
            addTranscription(transcriptionText, false);
            
            // Sempre gerar sugestão de resposta para o usuário
            getAISuggestion(transcriptionText);
        } else {
            // Fallback para simulação se a transcrição falhar
            console.log("[DEBUG] Transcrição falhou, usando simulação como fallback");
            simulateTranscription();
        }
        
        // Limpar a URL temporária para evitar vazamentos de memória
        URL.revokeObjectURL(audioUrl);
        
        // Limpar chunks para próxima gravação
        audioChunks = [];
    } catch (error) {
        console.error('[ERRO] Falha ao processar dados de áudio:', error);
        simulateTranscription(); // Fallback para simulação em caso de erro
    }
}

// Simulação de transcrição (em app real usaria API de transcrição)
function simulateTranscription() {
    console.log("[DEBUG] Simulando transcrição de áudio");
    
    // Em um app real, essa função enviaria o áudio para um serviço como
    // o Whisper da OpenAI ou Google Speech-to-Text
    
    const falas = [
        "Onde você se vê em 5 anos?",
        "Me conte sobre sua experiência profissional.",
        "Quais são suas principais habilidades técnicas?",
        "Como você lida com prazos apertados?",
        "Descreva um projeto desafiador que você trabalhou.",
        "Qual é o seu conhecimento em React e Node.js?",
        "Você tem experiência com metodologias ágeis?",
        "Como você mantém-se atualizado com as novas tecnologias?",
        "Qual foi seu maior desafio técnico e como você o superou?",
        "Você prefere trabalhar sozinho ou em equipe?"
    ];
    
    // Simular uma fala da entrevista - apenas do entrevistador
    const randomFala = falas[Math.floor(Math.random() * falas.length)];
    addTranscription(randomFala, false); // false indica que é o entrevistador falando
    
    // Atualizar o painel de debug
    if (isDebugMode) {
        const transcriptElem = document.getElementById('current-transcript');
        if (transcriptElem) {
            transcriptElem.textContent = `[${new Date().toLocaleTimeString()}] ENTREVISTADOR: ${randomFala}`;
        }
    }
    
    // Gerar sugestão da IA para a pergunta simulada
    getAISuggestion(randomFala);
}

// Obter sugestão da IA baseada na pergunta do entrevistador
async function getAISuggestion(interviewerQuestion) {
    if (!settings.openaiKey) {
        addSuggestion("Erro: Chave da API não configurada.");
        return;
    }
    
    try {
        console.log("[DEBUG] Enviando pergunta para a API da OpenAI");
        
        // Contexto para a IA
        const context = `
        Empresa: ${settings.company}
        Cargo: ${settings.jobPosition}
        Currículo: ${settings.cv}
        Idioma: ${settings.language}
        
        O entrevistador perguntou: "${interviewerQuestion}"
        
        Forneça uma resposta em formato markdown que seja clara, concisa e bem estruturada.
        Use **negrito** para conceitos importantes, _itálico_ para ênfase, e listas onde apropriado.
        
        IMPORTANTE: 
        1. Forneça APENAS a resposta direta para a pergunta
        2. NÃO inclua frases como "Pergunta:" ou "Resposta:" no início
        3. NÃO inclua conclusões como "Espero ter ajudado" ou "Isso esclarece sua dúvida" no final
        4. Responda diretamente como se fosse o candidato falando na primeira pessoa
        5. Não mencione que é uma sugestão ou que o candidato deve responder desta forma
        6. A resposta DEVE ser no idioma especificado (${settings.language})
        `;
        
        // Requisição para a API da OpenAI
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um assistente de entrevistas de emprego. Sua tarefa é fornecer sugestões para o candidato responder a perguntas do entrevistador. Forneça apenas a resposta direta, sem mencionar "Pergunta:" ou "Resposta:" no início, e sem concluir com frases como "Espero que isso ajude". Responda como se fosse o próprio candidato falando na primeira pessoa. Use o contexto fornecido sobre a empresa, o cargo e o currículo do candidato. Estruture suas respostas usando markdown para melhor legibilidade, destacando pontos importantes em negrito, organizando em listas quando apropriado, e colocando código em blocos de código quando relevante. IMPORTANTE: Responda sempre no idioma especificado (${settings.language}).`
                    },
                    {
                        role: 'user',
                        content: context
                    }
                ],
                max_tokens: 400,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[ERRO] API OpenAI retornou status ${response.status}:`, errorData);
            throw new Error(`API retornou status ${response.status}`);
        }
        
        const data = await response.json();
        console.log("[DEBUG] Resposta da API OpenAI:", data);
        
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            let suggestion = data.choices[0].message.content.trim();
            
            // Limpar qualquer padrão de "Pergunta:" ou "Resposta:" que ainda possa ter sido incluído
            suggestion = suggestion.replace(/^(Pergunta|Resposta):\s*/i, '');
            
            // Remover frases de conclusão comuns
            suggestion = suggestion.replace(/\b(espero|isso deve|espero que|isso esclarece|espero ter ajudado|tem mais alguma|posso ajudar|mais alguma dúvida|ficou claro|está claro|isso responde)\b.*$/is, '');
            
            // Remover linhas em branco extras no final
            suggestion = suggestion.replace(/\n+$/g, '');
            
            addSuggestion(suggestion);
        } else {
            throw new Error("Resposta da API não contém sugestões");
        }
        
    } catch (error) {
        console.error('[ERRO] Erro ao obter sugestão da IA:', error);
        
        // Fallback para sugestão simulada em caso de erro
        const suggestions = [
            "**Abordagem recomendada:**\n\n- Mencione sua experiência com projetos similares\n- Destaque resultados quantificáveis\n- Relacione suas habilidades com as necessidades da empresa",
            "**Pontos a destacar:**\n\n1. Sua experiência prévia nesta área\n2. Como você superou desafios similares\n3. Habilidades técnicas relevantes para a função",
            "**Resposta estruturada:**\n\n- **Contexto**: Relacione sua formação com a pergunta\n- **Experiência**: Cite exemplos concretos\n- **Resultados**: Demonstre o impacto do seu trabalho\n- **Aplicação**: Como isso se aplica ao cargo atual"
        ];
        
        const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
        addSuggestion("**Erro na API, sugestão alternativa:**\n\n" + randomSuggestion);
    }
}

// Pausar gravação
function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        statusText.textContent = 'Pausado';
        pauseInterviewButton.textContent = 'Retomar';
        
        clearInterval(recordingInterval);
    } else if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        statusText.textContent = 'Gravando';
        pauseInterviewButton.textContent = 'Pausar';
        
        recordingInterval = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
            }
        }, 5000);
    }
}

// Parar gravação
function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
        clearInterval(recordingInterval);
        
        // Parar reconhecimento de fala
        stopSpeechRecognition();
        
        // Parar todas as faixas de áudio
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        mediaRecorder = null;
        isRecording = false;
        updateButtonStates(false);
        statusText.textContent = 'Aguardando';
        statusText.classList.remove('text-success', 'text-danger');
    }
}

// Reconhecimento de fala contínuo durante a entrevista
function startContinuousSpeechRecognition() {
    // Verificar se a API está disponível
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
        console.log("[DEBUG] Reconhecimento de fala contínuo não disponível");
        return;
    }
    
    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        
        // Configurar o reconhecimento
        speechRecognition.lang = settings.language;
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        
        // Armazenar o texto reconhecido
        let currentTranscript = '';
        let lastProcessedTranscript = '';
        let isInterviewerSpeaking = false;
        
        // Manipular resultados do reconhecimento
        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            
            // Processar os resultados
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Atualizar o texto atual
            currentTranscript = finalTranscript || interimTranscript;
            
            // Mostrar no debug
            if (isDebugMode) {
                const transcriptElem = document.getElementById('current-transcript');
                if (transcriptElem) {
                    transcriptElem.textContent = `RECONHECIMENTO EM TEMPO REAL: ${currentTranscript}`;
                }
            }
            
            // Processar o texto final quando for significativo e diferente do último
            if (finalTranscript && finalTranscript.length > 5 && 
                finalTranscript !== lastProcessedTranscript) {
                
                // Determinar se é o entrevistador falando (lógica simplificada)
                isInterviewerSpeaking = finalTranscript.includes("?") || 
                                        finalTranscript.startsWith("Como") || 
                                        finalTranscript.startsWith("Qual") ||
                                        finalTranscript.startsWith("Me conte") ||
                                        finalTranscript.startsWith("Descreva");
                
                console.log(`[DEBUG] Texto final reconhecido: "${finalTranscript}" (${isInterviewerSpeaking ? 'entrevistador' : 'você'})`);
                
                // Adicionar à transcrição
                addTranscription(finalTranscript, !isInterviewerSpeaking);
                
                // Se for o entrevistador falando, obter sugestão da IA
                if (isInterviewerSpeaking) {
                    getAISuggestion(finalTranscript);
                }
                
                lastProcessedTranscript = finalTranscript;
            }
        };
        
        // Reiniciar automaticamente se parar
        speechRecognition.onend = () => {
            if (isRecording) {
                console.log("[DEBUG] Reconhecimento de fala reiniciando...");
                setTimeout(() => {
                    speechRecognition.start();
                }, 500);
            }
        };
        
        // Lidar com erros
        speechRecognition.onerror = (event) => {
            console.error(`[ERRO] Erro no reconhecimento de fala: ${event.error}`);
        };
        
        // Iniciar o reconhecimento
        speechRecognition.start();
        console.log("[DEBUG] Reconhecimento de fala contínuo iniciado");
        
    } catch (error) {
        console.error("[ERRO] Falha ao iniciar reconhecimento de fala:", error);
    }
}

// Parar reconhecimento de fala ao parar a gravação
function stopSpeechRecognition() {
    if (speechRecognition) {
        try {
            speechRecognition.stop();
            console.log("[DEBUG] Reconhecimento de fala parado");
        } catch (error) {
            console.error("[ERRO] Erro ao parar reconhecimento de fala:", error);
        }
        speechRecognition = null;
    }
}

// Função para atualizar o idioma da entrevista
function updateInterviewLanguage(languageCode) {
    settings.language = languageCode;
    
    // Atualizar o reconhecimento de fala se estiver ativo
    if (speechRecognition) {
        speechRecognition.lang = languageCode;
    }
    
    // Salvar configurações
    ipcRenderer.send('save-settings', settings);
}

// --------------------------------
// Event Listeners
// --------------------------------

// Alternar entre abas
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        switchTab(tabId);
    });
});

// Salvar configurações
saveSettingsButton.addEventListener('click', () => {
    settings = {
        openaiKey: openaiKeyInput.value,
        company: companyNameInput.value,
        jobPosition: jobPositionInput.value,
        cv: cvTextArea.value,
        userDevice: micSelect.value,
        systemDevice: systemAudioSelect.value,
        language: languageSelect.value
    };
    
    ipcRenderer.send('save-settings', settings);
    updateUIWithSettings();
    
    // Feedback visual
    saveSettingsButton.textContent = 'Salvo!';
    setTimeout(() => {
        saveSettingsButton.textContent = 'Salvar Configurações';
    }, 2000);
});

// Testar áudio
testAudioButton.addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined } 
        });
        
        // Criar feedback visual
        testAudioButton.textContent = 'Gravando...';
        testAudioButton.disabled = true;
        
        // Gravar por 3 segundos para teste
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        
        setTimeout(() => {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
            
            testAudioButton.textContent = 'Teste Bem-sucedido!';
            
            setTimeout(() => {
                testAudioButton.textContent = 'Testar Áudio';
                testAudioButton.disabled = false;
            }, 2000);
        }, 3000);
        
    } catch (error) {
        console.error('Erro ao testar áudio:', error);
        testAudioButton.textContent = 'Erro no Teste';
        
        setTimeout(() => {
            testAudioButton.textContent = 'Testar Áudio';
        }, 2000);
    }
});

// Controles da entrevista
startInterviewButton.addEventListener('click', startRecording);
pauseInterviewButton.addEventListener('click', pauseRecording);
stopInterviewButton.addEventListener('click', stopRecording);

// Toggle do modo debug
debugModeToggle.addEventListener('change', () => {
    isDebugMode = debugModeToggle.checked;
    console.log(`[CONFIG] Modo debug ${isDebugMode ? 'ativado' : 'desativado'}`);
    
    // Remover ou adicionar o painel de debug baseado no estado
    const existingPanel = document.getElementById('debug-panel');
    if (isDebugMode) {
        if (!existingPanel && isRecording) {
            addDebugPanel();
        }
    } else {
        if (existingPanel) {
            existingPanel.remove();
        }
    }
});

// Event Listeners para botões da barra de título
minimizeWindowButton.addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
});

closeWindowButton.addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

// --------------------------------
// Eventos IPC
// --------------------------------

// Receber configurações carregadas
ipcRenderer.on('settings-loaded', (event, loadedSettings) => {
    settings = loadedSettings;
    updateUIWithSettings();
});

// Confirmação de configurações salvas
ipcRenderer.on('settings-saved', (event, success) => {
    if (success) {
        console.log('Configurações salvas com sucesso');
    }
});

// Receber fontes do desktopCapturer (usado como fallback se getDisplayMedia falhar)
ipcRenderer.on('desktop-capturer-sources', async (event, sources) => {
    try {
        console.log('[DEBUG] Fontes do desktopCapturer recebidas:', sources);
        
        if (sources.length === 0) {
            throw new Error('Nenhuma fonte disponível para captura');
        }
        
        // No Linux, o main.js já deve ter selecionado a melhor fonte,
        // então usamos a primeira recebida sem pedir ao usuário
        const source = sources[0];
        console.log(`[DEBUG] Usando fonte automaticamente: ${source.name}`);
        
        // Configurar stream com constraints modernas para Linux
        let stream;
        try {
            // Primeiro tente o método moderno com getUserMedia
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // Especificando que queremos capturar o áudio do sistema
                    // e não o microfone
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false // Sem vídeo para simplicidade
            });
        } catch (err) {
            console.log('[DEBUG] Método moderno falhou, tentando método Electron específico');
            
            // Se falhar, tente o método específico do Electron
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                        minWidth: 1,
                        maxWidth: 1,
                        minHeight: 1,
                        maxHeight: 1,
                        maxFrameRate: 1
                    }
                }
            });
        }
        
        // O resto do processo é igual ao método principal
        if (isDebugMode) {
            setupAudioAnalyzer(stream);
        }
        
        startContinuousSpeechRecognition();
        
        const supportedMimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        
        const mimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm';
        
        const recorderOptions = {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        };
        
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                if (isDebugMode) {
                    console.log(`[DEBUG] Chunk de áudio recebido: ${event.data.size} bytes, tipo: ${event.data.type}`);
                }
            }
        };
        
        mediaRecorder.onstop = processAudioData;
        
        mediaRecorder.start(1000);
        isRecording = true;
        updateButtonStates(true);
        statusText.textContent = 'Gravando (modo fallback)';
        statusText.classList.add('text-success');
        
        recordingInterval = setInterval(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
            }
        }, 3000);
        
        if (isDebugMode) {
            addDebugPanel();
        }
        
    } catch (error) {
        console.error('[ERRO] Falha ao usar método fallback:', error);
        statusText.textContent = 'Não foi possível iniciar gravação';
        statusText.classList.add('text-danger');
    }
});

// --------------------------------
// Inicialização
// --------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Inicializando aplicativo...');
        
        // Adicionar estilos CSS para o markdown
        adicionarEstilosMarkdown();
        
        // Carregar configurações
        loadSettings();
        
        // Verificar permissões de áudio
        await checkAudioPermissions();
        
        // Obter dispositivos de áudio
        await getAudioDevices();
        
        console.log('Aplicativo inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar aplicativo:', error);
    }
});

// Verificar permissões de áudio
async function checkAudioPermissions() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('Erro ao verificar permissões de áudio:', error);
        // Mostrar mensagem de erro na interface
        const errorMessage = document.createElement('div');
        errorMessage.classList.add('error-message');
        errorMessage.innerHTML = `
            <p>Não foi possível acessar o microfone. Por favor, verifique as permissões.</p>
            <p>Erro: ${error.message}</p>
        `;
        document.querySelector('.settings-form').prepend(errorMessage);
        return false;
    }
}

// Adicionar estilos CSS para melhorar a visualização do markdown
function adicionarEstilosMarkdown() {
    const style = document.createElement('style');
    style.textContent = `
        .ai-suggestion {
            overflow-wrap: break-word;
        }
        
        .ai-suggestion h1, .ai-suggestion h2, .ai-suggestion h3 {
            margin-top: 0.8em;
            margin-bottom: 0.5em;
            color: #1a73e8;
            font-weight: 600;
        }
        
        .ai-suggestion h1 {
            font-size: 1.4em;
            border-bottom: 1px solid #e1e4e8;
            padding-bottom: 0.2em;
        }
        
        .ai-suggestion h2 {
            font-size: 1.2em;
        }
        
        .ai-suggestion h3 {
            font-size: 1.1em;
        }
    `;
    document.head.appendChild(style);
} 