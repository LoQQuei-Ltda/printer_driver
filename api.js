/**
 * API do Sistema de Gerenciamento de Impressão
 * Este módulo fornece endpoints para controlar a aplicação remotamente
 */

const cors = require('cors');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');

function initAPI(appConfig, mainWindow, createMainWindow, isAuthenticated) {
    const app = express();
    
    // Middlewares
    app.use(cors());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(async (request, response, next) => {
        console.log(`API ${request.method} ${request.path}`);
        next();
    });

    // Middleware para verificar autenticação
    const checkAuth = (request, response, next) => {
        if (!isAuthenticated()) {
            return response.status(401).json({
                success: false,
                message: 'Usuário não autenticado'
            });
        }
        next();
    };
    
    const { getAutoPrintConfig } = require('./main');

    // Endpoint para abrir a aplicação na seção de arquivos para impressão
    app.get('/api/file', checkAuth, (request, response) => {
        try {
            const fileId = request.query.fileId;
            

            // Verificar se a impressão automática está habilitada
            const autoPrintConfig = getAutoPrintConfig();

            if (autoPrintConfig && autoPrintConfig.enabled && autoPrintConfig.printerId && fileId) {
                // Imprimir automaticamente
                console.log(`Impressão automática do arquivo ${fileId} na impressora ${autoPrintConfig.printerId}`);

                // Fazer a requisição para a API local
                axios.post(`${appConfig.apiLocalUrl}/print`, {
                    fileId: fileId,
                    assetId: autoPrintConfig.printerId
                })
                    .then(printResponse => {
                        if (printResponse.status === 200) {
                            console.log(`Arquivo ${fileId} enviado automaticamente para impressão na impressora ${autoPrintConfig.printerId}`);

                            // Mostrar notificação
                            if (mainWindow) {
                                mainWindow.webContents.send('auto-print-notification', {
                                    success: true,
                                    fileId: fileId,
                                    printerId: autoPrintConfig.printerId,
                                    message: 'Arquivo enviado para impressão automaticamente!'
                                });
                            }

                            return response.status(200).json({
                                success: true,
                                message: 'Arquivo enviado para impressão automaticamente',
                                fileId: fileId,
                                printerId: autoPrintConfig.printerId
                            });
                        } else {
                            console.error('Erro ao enviar arquivo para impressão:', error);
                            throw new Error('Erro ao enviar arquivo para impressão');
                        }
                    })
                    .catch(error => {
                        console.error('Erro na impressão automática:', error);

                        // Mostrar notificação de erro
                        if (mainWindow) {
                            mainWindow.webContents.send('auto-print-notification', {
                                success: false,
                                message: 'Erro ao enviar arquivo para impressão automática'
                            });
                        }

                        // Mesmo em caso de erro, abrir a aplicação para tratamento manual
                        if (!mainWindow || mainWindow.isDestroyed()) {
                            createMainWindow();
                        } else {
                            if (mainWindow.isMinimized()) mainWindow.restore();
                            mainWindow.show();
                            mainWindow.focus();
                        }

                        // Navegar para a seção de arquivos
                        mainWindow.webContents.send('navegar-para', { secao: 'arquivos' });

                        return response.status(200).json({
                            success: false,
                            message: 'Erro na impressão automática, aplicação aberta para tratamento manual',
                            error: error.message
                        });
                    });

                return;
            }

            // Comportamento padrão (sem impressão automática)
            if (!mainWindow || mainWindow.isDestroyed()) {
                createMainWindow();
            } else {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }

            // Navegar para a seção de arquivos
            mainWindow.webContents.send('navegar-para', { secao: 'arquivos' });

            return response.status(200).json({
                success: true,
                message: 'Aplicação aberta na seção de arquivos'
            });
        } catch (error) {
            console.error('Erro ao abrir aplicação:', error);
            return response.status(500).json({
                success: false,
                message: 'Erro ao abrir aplicação',
                error: error.message
            });
        }
    });

    // Rota de saúde para verificar se a API está funcionando
    app.get('/api', (request, response) => {
        return response.status(200).json({
            message: 'API ok'
        });
    });

    // Iniciar o servidor
    const server = app.listen(appConfig.desktopApiPort, '0.0.0.0', () => {
        console.log(`API do Sistema de Gerenciamento de Impressão rodando na porta ${appConfig.desktopApiPort}`);
    });

    // Tratar erros de servidor
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`A porta ${appConfig.desktopApiPort} já está em uso. A API não pôde ser iniciada.`);
        } else {
            console.error('Erro ao iniciar servidor API:', error);
        }
    });

    return server;
}

module.exports = { initAPI };