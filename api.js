/**
 * API do Sistema de Gerenciamento de Impressão
 * Este módulo fornece endpoints para controlar a aplicação remotamente
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

function initAPI(appConfig, mainWindow, createMainWindow, isAuthenticated) {
    const app = express();

    // Middlewares
    app.use(cors());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

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

    // Endpoint para abrir a aplicação na seção de arquivos para impressão
    app.get('/api/file', checkAuth, (request, response) => {
        try {
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
    const server = app.listen(appConfig.desktopApiPort, () => {
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