# Interview Helper

Um assistente desktop para entrevistas de emprego que utiliza IA para ajudar durante suas entrevistas, captando o áudio e fornecendo sugestões em tempo real.

## Funcionalidades

- Captura de áudio do seu microfone e do sistema
- Transcrição de conversas em tempo real
- Sugestões inteligentes baseadas no contexto da entrevista
- Personalização com seu currículo e informações da empresa
- Modo discreto (minimiza para a bandeja do sistema)

## Requisitos

- Node.js 14 ou superior
- Chave API da OpenAI

## Instalação

Clone o repositório e instale as dependências:

```bash
git clone https://github.com/seu-usuario/interview-helper.git
cd interview-helper
npm install
```

## Configuração

1. Abra o aplicativo
2. Na aba "Configuração", insira sua chave API da OpenAI
3. Preencha as informações da empresa e cargo
4. Cole um resumo do seu currículo ou habilidades
5. Selecione os dispositivos de áudio
6. Salve as configurações

## Uso

1. Na aba "Entrevista", clique em "Iniciar Entrevista"
2. O aplicativo começará a capturar o áudio e fornecer sugestões
3. Você pode pausar ou encerrar a entrevista a qualquer momento
4. Minimize o aplicativo para a bandeja do sistema durante o compartilhamento de tela

## Desenvolvimento

Para executar o aplicativo em modo de desenvolvimento:

```bash
npm start
```

Para construir o aplicativo para distribuição:

```bash
npm run build
```

## Notas Importantes

- Este aplicativo funciona melhor em um computador com dois monitores
- Mantenha o aplicativo em um monitor secundário durante entrevistas remotas
- Certifique-se de que seu sistema permite a captura de áudio do sistema

## Licença

MIT 