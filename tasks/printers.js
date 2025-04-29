const axios = require('axios');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const net = require('net');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuração
const PARALLELISM = 50;
const CONNECTION_TIMEOUT = 200;
const MAX_EXECUTION_TIME = 5 * 60 * 1000;

module.exports = {
    printersSync: async () => {
        const { appConfig, userData } = require('../main');
        
        try {
            // Definir timeout global para não bloquear por muito tempo
            const globalTimeout = setTimeout(() => {
                console.log('Tempo máximo de execução atingido, interrompendo...');
                process.exit(1);
            }, MAX_EXECUTION_TIME);
            
            // Será removido ao final da execução
            globalTimeout.unref();
            
            // Carregar mapeamentos de MAC para IP salvos anteriormente
            const macToIpMapFile = path.join(appConfig.dataPath, 'mac_to_ip_map.json');
            let macToIpMap = {};
            
            try {
                if (fs.existsSync(macToIpMapFile)) {
                    const mapData = fs.readFileSync(macToIpMapFile, 'utf8');
                    macToIpMap = JSON.parse(mapData);
                    console.log('Mapeamento MAC->IP carregado:', macToIpMap);
                }
            } catch (error) {
                console.error('Erro ao carregar mapeamento MAC->IP:', error);
                // Continuar com mapa vazio se houver erro
                macToIpMap = {};
            }

            // 1. Obter impressoras do servidor central
            let printersSystem;
            try {
                printersSystem = await axios.get(`${appConfig.apiPrincipalServiceUrl}/desktop/printers`, {
                    headers: {
                        'Authorization': `Bearer ${userData.token}`,
                        'accept': 'application/json'
                    }
                });
            } catch (error) {
                console.log('Erro ao obter impressoras do servidor:', error?.response?.data);
                clearTimeout(globalTimeout);
                return;
            }

            if (!printersSystem || printersSystem.status !== 200) {
                clearTimeout(globalTimeout);
                return;
            }

            let printersData = printersSystem.data ? printersSystem.data.data : []; 

            if (!Array.isArray(printersData)) {
                printersData = [printersData];
            }

            console.log(`Recebidas ${printersData.length} impressoras do servidor central`);
            
            // Mostrar todos os MACs para facilitar diagnóstico
            console.log("MACs das impressoras recebidas:");
            printersData.forEach(printer => {
                if (printer.mac_address) {
                    const rawMac = printer.mac_address;
                    const normalizedMac = normalizeMAC(rawMac);
                    const protocol = printer.protocol || 'socket';
                    const port = printer.port || getDefaultPort(protocol);
                    
                    console.log(`- ${printer.name}: Original=${rawMac}, Normalizado=${normalizedMac}, Driver=${printer.driver || 'generic'}, Protocolo=${protocol}, Porta=${port}`);
                }
            });

            // 2. Obter IPs locais disponíveis
            const localNetworks = getLocalNetworks();
            console.log('Redes locais disponíveis:', localNetworks);

            // 3. Primeiro, fazer ping em todas as redes para popular a tabela ARP
            for (const network of localNetworks) {
                try {
                    console.log(`\nRealizando ping scan na rede ${network.network}/${network.cidr}`);
                    await pingRangeFast(network.network, network.cidr);
                    
                    // Imprimir a tabela ARP após cada rede
                    await dumpArpTable();
                } catch (error) {
                    console.log(`Erro no ping scan da rede ${network.network}: ${error.message}`);
                }
            }
            
            // 4. Para cada impressora, encontrar o IP interno
            const updatedPrinters = [];
            let macIpMapChanged = false;

            for (const printer of printersData) {
                const { id, name, mac_address, ip_address: externalIp } = printer;
                // Usar os valores recebidos da API, com fallbacks para os valores padrão
                const driver = printer.driver || 'generic';  
                const protocol = printer.protocol || 'socket';
                const port = printer.port || getDefaultPort(protocol);
                
                console.log(`\nProcessando impressora: ${name} (MAC: ${mac_address}, Driver: ${driver}, Protocolo: ${protocol}, Porta: ${port})`);

                // Se não tiver MAC, não podemos descobrir o IP
                if (!mac_address) {
                    console.log(`Impressora ${name} não tem MAC address, mantendo dados originais`);
                    updatedPrinters.push(printer);
                    continue;
                }

                // Normalizar o MAC - muito importante para comparações corretas
                const normalizedMac = normalizeMAC(mac_address);
                console.log(`MAC normalizado: ${normalizedMac}`);
                
                let internalIp = null;
                let portOpen = false;
                let ippPath = null;

                // Verificar se já temos um IP salvo para este MAC e testar
                // Tentar obter um IP salvo com várias normalizações possíveis
                const storedIp = findStoredIpForMac(macToIpMap, mac_address);
                
                if (storedIp) {
                    console.log(`IP anterior encontrado para ${name}: ${storedIp}`);
                    
                    // Se for protocolo IPP/IPPS, precisamos verificar o endpoint
                    if (['ipp', 'ipps'].includes(protocol.toLowerCase())) {
                        try {
                            const ippResult = await detectIppEndpoint(protocol, storedIp, port);
                            if (ippResult.valid) {
                                console.log(`Endpoint IPP válido encontrado em ${storedIp}:${port}${ippResult.path}`);
                                internalIp = storedIp;
                                portOpen = true;
                                ippPath = ippResult.path;
                            } else {
                                console.log(`Nenhum endpoint IPP válido encontrado em ${storedIp}:${port}`);
                            }
                        } catch (error) {
                            console.warn(`Erro ao verificar endpoint IPP em ${storedIp}:`, error.message);
                        }
                    } else {
                        // Para outros protocolos, apenas verificar se a porta está aberta
                        const isConnected = await testPrinterConnection(storedIp, port);
                        if (isConnected) {
                            console.log(`IP anterior está respondendo na porta ${port}: ${storedIp}`);
                            internalIp = storedIp;
                            portOpen = true;
                        } else {
                            console.log(`IP anterior não está respondendo na porta ${port}, iniciando nova descoberta`);
                        }
                    }
                }

                // Se não temos IP ou ele não está respondendo, descobrir na rede
                if (!internalIp) {
                    console.log(`Iniciando descoberta de IP para MAC ${normalizedMac}`);
                    
                    // Verificar a tabela ARP após o ping scan - usando todas as possíveis normalizações
                    const foundIP = await findMacInArpTable(normalizedMac);
                    if (foundIP) {
                        console.log(`IP encontrado na tabela ARP após scan: ${foundIP}`);
                        
                        // Verificar porta da impressora ou endpoint IPP
                        if (['ipp', 'ipps'].includes(protocol.toLowerCase())) {
                            try {
                                const ippResult = await detectIppEndpoint(protocol, foundIP, port);
                                if (ippResult.valid) {
                                    console.log(`Endpoint IPP válido encontrado em ${foundIP}:${port}${ippResult.path}`);
                                    internalIp = foundIP;
                                    portOpen = true;
                                    ippPath = ippResult.path;
                                } else {
                                    console.log(`Nenhum endpoint IPP válido encontrado em ${foundIP}:${port}`);
                                }
                            } catch (error) {
                                console.warn(`Erro ao verificar endpoint IPP em ${foundIP}:`, error.message);
                            }
                        } else {
                            const isConnected = await testPrinterConnection(foundIP, port);
                            if (isConnected) {
                                internalIp = foundIP;
                                portOpen = true;
                            } else {
                                console.log(`Porta ${port} fechada em ${foundIP}`);
                            }
                        }
                    }
                    
                    // Se ainda não encontrou, fazer escaneamento de portas em todas as redes
                    if (!internalIp) {
                        for (const network of localNetworks) {
                            console.log(`Escaneando rede ${network.network}/${network.cidr} por dispositivos com porta aberta...`);
                            
                            // Tentar a porta específica da impressora
                            const openPortDevices = await scanNetworkForOpenPort(
                                network.network, 
                                network.cidr, 
                                port, 
                                protocol
                            );
                            
                            // Para cada dispositivo encontrado, verificar MAC address
                            for (const ip of openPortDevices) {
                                console.log(`Dispositivo encontrado em ${ip}, verificando MAC...`);
                                
                                // Garantir que está na tabela ARP
                                await execAsync(`ping -c 1 -W 1 ${ip}`).catch(() => {});
                                
                                const deviceMac = await getMacFromIp(ip);
                                if (deviceMac) {
                                    const normalizedDeviceMac = normalizeMAC(deviceMac);
                                    console.log(`MAC do dispositivo: ${deviceMac} (normalizado: ${normalizedDeviceMac})`);
                                    
                                    if (normalizedDeviceMac === normalizedMac) {
                                        console.log(`MAC correspondente encontrado em ${ip}!`);
                                        
                                        // Se for IPP/IPPS, verificar endpoint
                                        if (['ipp', 'ipps'].includes(protocol.toLowerCase())) {
                                            try {
                                                const ippResult = await detectIppEndpoint(protocol, ip, port);
                                                if (ippResult.valid) {
                                                    console.log(`Endpoint IPP válido encontrado em ${ip}:${port}${ippResult.path}`);
                                                    ippPath = ippResult.path;
                                                } else {
                                                    console.log(`Nenhum endpoint IPP válido encontrado em ${ip}:${port}, mas a porta está aberta`);
                                                }
                                            } catch (error) {
                                                console.warn(`Erro ao verificar endpoint IPP em ${ip}:`, error.message);
                                            }
                                        }
                                        
                                        internalIp = ip;
                                        portOpen = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (internalIp) break;
                        }
                    }

                    if (internalIp) {
                        console.log(`IP interno descoberto: ${internalIp}`);
                        
                        // Atualizar o mapeamento usando o MAC normalizado
                        macToIpMap[normalizedMac] = internalIp;
                        macIpMapChanged = true;
                    } else {
                        console.log(`Não foi possível descobrir o IP interno, mantendo IP externo`);
                        
                        // Verificar se o IP externo funciona na rede local
                        if (externalIp) {
                            // Se for IPP/IPPS, verificar endpoint
                            if (['ipp', 'ipps'].includes(protocol.toLowerCase())) {
                                try {
                                    const ippResult = await detectIppEndpoint(protocol, externalIp, port);
                                    if (ippResult.valid) {
                                        console.log(`Endpoint IPP válido encontrado no IP externo ${externalIp}:${port}${ippResult.path}`);
                                        internalIp = externalIp;
                                        portOpen = true;
                                        ippPath = ippResult.path;
                                        macToIpMap[normalizedMac] = internalIp;
                                        macIpMapChanged = true;
                                    } else {
                                        console.log(`Nenhum endpoint IPP válido encontrado no IP externo ${externalIp}:${port}`);
                                    }
                                } catch (error) {
                                    console.warn(`Erro ao verificar endpoint IPP no IP externo ${externalIp}:`, error.message);
                                }
                            } else {
                                const isConnected = await testPrinterConnection(externalIp, port);
                                if (isConnected) {
                                    console.log(`IP externo ${externalIp} está acessível na rede local!`);
                                    internalIp = externalIp;
                                    portOpen = true;
                                    macToIpMap[normalizedMac] = internalIp;
                                    macIpMapChanged = true;
                                }
                            }
                        }
                        
                        // Se ainda não encontrou, manter o IP original
                        if (!internalIp) {
                            updatedPrinters.push(printer);
                            continue;
                        }
                    }
                }

                // Criar versão atualizada da impressora com o IP interno
                const updatedPrinter = {
                    ...printer,
                    ip_address: internalIp,
                    // Incluir informações sobre a disponibilidade da porta
                    connectivity: {
                        port: {
                            open: portOpen,
                            number: port
                        }
                    }
                };
                
                // Se encontramos um caminho IPP válido, incluí-lo
                if (ippPath) {
                    updatedPrinter.path = ippPath;
                }

                updatedPrinters.push(updatedPrinter);
                console.log(`Impressora ${name} atualizada com IP interno: ${internalIp}, porta ${port} ${portOpen ? 'aberta' : 'fechada'}${ippPath ? ', caminho IPP: ' + ippPath : ''}`);
            }

            // Salvar o mapeamento MAC->IP se foi alterado
            if (macIpMapChanged) {
                try {
                    // Garantir que o diretório existe
                    if (!fs.existsSync(appConfig.dataPath)) {
                        fs.mkdirSync(appConfig.dataPath, { recursive: true });
                    }
                    
                    fs.writeFileSync(macToIpMapFile, JSON.stringify(macToIpMap, null, 2), 'utf8');
                    console.log('Mapeamento MAC->IP salvo');
                } catch (error) {
                    console.error('Erro ao salvar mapeamento MAC->IP:', error);
                }
            }

            // 5. Enviar as impressoras atualizadas para sincronização
            console.log(`Enviando ${updatedPrinters.length} impressoras para sincronização`);
            let printersResult;
            try {
                printersResult = await axios.post(`${appConfig.apiLocalUrl}/sync/printers`, {
                    printers: updatedPrinters
                }, {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                console.log('Erro ao sincronizar impressoras:', error?.response?.data);
                clearTimeout(globalTimeout);
                return;
            }

            if (!printersResult || printersResult.status !== 200) {
                clearTimeout(globalTimeout);
                return;
            }

            const printersResultData = printersResult.data ? printersResult.data.data : null; 
            
            // Processar warnings e erros
            if (printersResultData) {
                if (printersResultData.details?.warnings?.length > 0) {
                    console.log('Avisos durante a sincronização:');
                    printersResultData.details.warnings.forEach(warning => {
                        console.log(`- ${warning.name}: ${warning.warning}`);
                        
                        // Se a impressora está sem conexão, remover do mapeamento para tentar novamente da próxima vez
                        if (warning.connectivity?.port?.open === false) {
                            const printer = printersData.find(p => p.id === warning.id);
                            if (printer && printer.mac_address) {
                                const mac = normalizeMAC(printer.mac_address);
                                if (macToIpMap[mac]) {
                                    console.log(`Removendo mapeamento para MAC ${mac} devido a falha de conexão`);
                                    delete macToIpMap[mac];
                                    macIpMapChanged = true;
                                }
                            }
                        }
                    });
                    
                    // Salvar mapeamento atualizado após processar warnings
                    if (macIpMapChanged) {
                        try {
                            fs.writeFileSync(macToIpMapFile, JSON.stringify(macToIpMap, null, 2), 'utf8');
                            console.log('Mapeamento MAC->IP atualizado após processar warnings');
                        } catch (error) {
                            console.error('Erro ao salvar mapeamento atualizado:', error);
                        }
                    }
                }
                
                if (printersResultData.details?.errors?.length > 0) {
                    console.log('Erros durante a sincronização:');
                    printersResultData.details.errors.forEach(error => {
                        console.log(`- ${error.name || 'Impressora desconhecida'}: ${error.error}`);
                    });
                }
            }

            clearTimeout(globalTimeout);
            return printersResultData;
        } catch (error) {
            console.error('Erro geral na sincronização de impressoras:', error);
            return null;
        }
    }
};

/**
 * Retorna a porta padrão para um protocolo
 * @param {string} protocol - Protocolo
 * @returns {number} Porta padrão
 */
function getDefaultPort(protocol) {
    switch (protocol?.toLowerCase()) {
        case 'ipp':
        case 'ipps':
            return 631;
        case 'lpd':
            return 515;
        case 'http':
            return 80;
        case 'https':
            return 443;
        case 'socket':
        default:
            return 9100;
    }
}

/**
 * Detecta o endpoint IPP válido em um servidor
 * @param {string} protocol - Protocolo (ipp ou ipps)
 * @param {string} ip - Endereço IP
 * @param {number} port - Porta
 * @returns {Promise<{valid: boolean, path: string|null, error: string|null}>}
 */
async function detectIppEndpoint(protocol, ip, port = 631) {
    // Lista de caminhos comuns para endpoints IPP
    const commonPaths = [
        '/ipp/print',
        '/ipp',
        '/printer',
        '/printers/printer',
        '',
        '/IPP/Print',
        '/print'
    ];
    
    console.log(`Verificando endpoints ${protocol} em ${ip}:${port}`);
    
    for (const path of commonPaths) {
        const fullPath = path || '/';
        console.log(`Testando caminho: ${fullPath}`);
        
        try {
            const isValid = await testEndpoint(ip, port, fullPath, protocol === 'ipps');
            
            if (isValid) {
                return { valid: true, path: fullPath };
            }
        } catch (error) {
            console.warn(`Erro ao testar ${fullPath}: ${error.message}`);
        }
    }
    
    return { valid: false, path: null, error: 'Nenhum endpoint IPP válido encontrado' };
}

/**
 * Testa se um endpoint HTTP/HTTPS está respondendo
 * @param {string} host - Endereço IP ou hostname
 * @param {number} port - Porta
 * @param {string} path - Caminho para testar
 * @param {boolean} secure - Usar HTTPS em vez de HTTP
 * @returns {Promise<boolean>} true se o endpoint estiver respondendo
 */
function testEndpoint(host, port, path, secure = false) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET',
            timeout: 3000,
            rejectUnauthorized: false // Aceitar certificados autoassinados
        };
        
        const client = secure ? https : http;
        
        const req = client.request(options, (res) => {
            // Alguns servidores IPP retornam códigos diferentes, mas ainda são válidos
            // 200 OK, 400 Bad Request (mas respondendo), etc.
            if (res.statusCode < 500) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        
        req.on('error', (error) => {
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        
        req.end();
    });
}

/**
 * Busca um IP armazenado para um MAC usando várias normalizações possíveis
 * @param {Object} macToIpMap - Mapeamento MAC->IP
 * @param {string} mac - MAC address a buscar
 * @returns {string|null} IP armazenado ou null
 */
function findStoredIpForMac(macToIpMap, mac) {
    if (!mac) return null;
    
    // Tentar com o MAC normalizado
    const normalizedMac = normalizeMAC(mac);
    if (macToIpMap[normalizedMac]) return macToIpMap[normalizedMac];
    
    // Tentar com várias outras variações
    const variations = [
        mac.toLowerCase(),                                  // lowercase
        mac.toUpperCase(),                                  // uppercase
        mac.toLowerCase().replace(/[:-]/g, ':'),           // lowercase com :
        mac.toUpperCase().replace(/[:-]/g, ':'),           // uppercase com :
        mac.toLowerCase().replace(/[:-]/g, '-'),           // lowercase com -
        mac.toUpperCase().replace(/[:-]/g, '-'),           // uppercase com -
        mac.toLowerCase().replace(/[:-]/g, '')             // lowercase sem separadores
    ];
    
    for (const variant of variations) {
        if (macToIpMap[variant]) return macToIpMap[variant];
    }
    
    return null;
}

/**
 * Normaliza qualquer formato de MAC para o formato canônico xx:xx:xx:xx:xx:xx em minúsculas
 * @param {string} mac - MAC address em qualquer formato
 * @returns {string} MAC address normalizado
 */
function normalizeMAC(mac) {
    if (!mac) return '';
    
    // Remover todos os caracteres não hexadecimais
    const hexOnly = mac.toLowerCase().replace(/[^a-f0-9]/g, '');
    
    // Verificar se o comprimento está correto (12 caracteres hexadecimais)
    if (hexOnly.length !== 12) {
        console.warn(`Aviso: MAC inválido após normalização: ${mac} -> ${hexOnly}`);
        return hexOnly; // Retornar o que temos, mesmo inválido
    }
    
    // Formatar como xx:xx:xx:xx:xx:xx
    return hexOnly.match(/.{2}/g).join(':');
}

/**
 * Mostra a tabela ARP atual
 */
async function dumpArpTable() {
    try {
        const { stdout } = await execAsync('arp -a');
        console.log("\n=== TABELA ARP ATUAL ===");
        stdout.trim().split('\n').forEach(line => {
            if (line.trim()) console.log(line.trim());
        });
        console.log("========================\n");
    } catch (error) {
        console.error('Erro ao exibir tabela ARP:', error.message);
    }
}

/**
 * Faz ping scan em toda a rede para popular a tabela ARP
 * @param {string} networkBase - Base da rede (ex: 192.168.1.0)
 * @param {number} cidr - CIDR da rede
 */
async function pingRangeFast(networkBase, cidr) {
    // Calcular range de IPs baseado no CIDR
    const maxHosts = Math.min(254, Math.pow(2, 32 - cidr) - 2);
    console.log(`Escaneando ${maxHosts} IPs com ping...`);
    
    const networkParts = networkBase.split('.');
    
    // Ajustar o último octeto para 0
    networkParts[3] = '0';
    
    // Criar batches para processamento paralelo
    const batchSize = PARALLELISM;
    const batches = [];
    
    for (let i = 1; i <= maxHosts; i += batchSize) {
        const batch = [];
        for (let j = i; j < i + batchSize && j <= maxHosts; j++) {
            networkParts[3] = j.toString();
            batch.push(networkParts.join('.'));
        }
        batches.push(batch);
    }
    
    // Processar cada batch em paralelo
    let completedBatches = 0;
    for (const batch of batches) {
        await Promise.all(
            batch.map(ip => execAsync(`ping -c 1 -W 1 ${ip}`).catch(() => {}))
        );
        
        completedBatches++;
        if (completedBatches % 5 === 0 || completedBatches === batches.length) {
            console.log(`Progresso: ${Math.round((completedBatches / batches.length) * 100)}%`);
        }
    }
    
    console.log('Ping scan concluído');
}

/**
 * Escaneia a rede por dispositivos com a porta especificada aberta
 * @param {string} networkBase - Base da rede (ex: 192.168.1.0)
 * @param {number} cidr - CIDR da rede
 * @param {number} port - Porta a verificar
 * @param {string} protocol - Protocolo da impressora
 * @returns {Promise<string[]>} Lista de IPs com a porta aberta
 */
async function scanNetworkForOpenPort(networkBase, cidr, port, protocol) {
    // Calcular range de IPs baseado no CIDR
    const maxHosts = Math.min(254, Math.pow(2, 32 - cidr) - 2);
    console.log(`Escaneando ${maxHosts} IPs para porta ${port}...`);
    
    const networkParts = networkBase.split('.');
    networkParts[3] = '0'; // Resetar o último octeto
    
    // Determinar portas a verificar
    const portsToCheck = [port];
    
    // Adicionar portas alternativas com base no protocolo
    if (protocol === 'ipp' && port !== 631) portsToCheck.push(631);
    if (protocol === 'ipps' && port !== 631) portsToCheck.push(631);
    if (protocol === 'lpd' && port !== 515) portsToCheck.push(515);
    if (protocol === 'socket' && port !== 9100) portsToCheck.push(9100);
    
    // Criar lista completa de IPs
    const allIPs = [];
    for (let i = 1; i <= maxHosts; i++) {
        networkParts[3] = i.toString();
        allIPs.push(networkParts.join('.'));
    }
    
    // Dividir em batches para processamento paralelo
    const batchSize = PARALLELISM;
    const batches = [];
    for (let i = 0; i < allIPs.length; i += batchSize) {
        batches.push(allIPs.slice(i, i + batchSize));
    }
    
    const openPortDevices = [];
    let completedBatches = 0;
    
    for (const batch of batches) {
        const results = await Promise.all(
            batch.map(async (ip) => {
                for (const testPort of portsToCheck) {
                    try {
                        const isOpen = await testPrinterConnection(ip, testPort);
                        if (isOpen) return ip;
                    } catch (e) {
                        // Ignorar erros de conexão
                    }
                }
                return null;
            })
        );
        
        // Adicionar apenas resultados válidos
        results.filter(ip => ip !== null).forEach(ip => {
            if (!openPortDevices.includes(ip)) {
                openPortDevices.push(ip);
            }
        });
        
        completedBatches++;
        if (completedBatches % 5 === 0 || completedBatches === batches.length) {
            console.log(`Progresso: ${Math.round((completedBatches / batches.length) * 100)}% - ${openPortDevices.length} dispositivos encontrados`);
        }
    }
    
    console.log(`Scan concluído. Encontrados ${openPortDevices.length} dispositivos com porta aberta.`);
    return openPortDevices;
}

/**
 * Busca um MAC address na tabela ARP
 * @param {string} macAddress - MAC address a procurar
 * @returns {Promise<string|null>} IP encontrado ou null
 */
async function findMacInArpTable(macAddress) {
    try {
        const { stdout } = await execAsync('arp -a');
        const lines = stdout.split('\n');
        
        // Normalizar o MAC que estamos procurando
        const normalizedMacToFind = normalizeMAC(macAddress);
        console.log(`Procurando MAC ${normalizedMacToFind} na tabela ARP...`);
        
        // Para cada linha na tabela ARP
        for (const line of lines) {
            // Extrair o MAC da linha usando regex mais abrangente
            const macMatch = line.match(/([0-9A-Fa-f]{1,2}[:-]){5}([0-9A-Fa-f]{1,2})/);
            if (macMatch && macMatch[0]) {
                const rawMac = macMatch[0];
                const normalizedMac = normalizeMAC(rawMac);
                
                // Debug para ver todos os MACs na tabela ARP
                if (line.includes('(') && line.includes(')')) {
                    const ipMatch = line.match(/\(([0-9.]+)\)/);
                    if (ipMatch && ipMatch[1]) {
                        console.log(`Tabela ARP: IP=${ipMatch[1]}, MAC=${rawMac} (normalizado=${normalizedMac})`);
                    }
                }
                
                // Comparar MACs normalizados
                if (normalizedMac === normalizedMacToFind) {
                    const ipMatch = line.match(/\(([0-9.]+)\)/);
                    if (ipMatch && ipMatch[1]) {
                        console.log(`MAC ${normalizedMacToFind} encontrado para IP ${ipMatch[1]}`);
                        return ipMatch[1];
                    }
                }
            }
        }
        
        console.log(`MAC ${normalizedMacToFind} não encontrado na tabela ARP`);
        return null;
    } catch (error) {
        console.error('Erro ao consultar tabela ARP:', error.message);
        return null;
    }
}

/**
 * Obtém o MAC address de um IP usando a tabela ARP
 * @param {string} ip - Endereço IP
 * @returns {Promise<string|null>} MAC encontrado ou null
 */
async function getMacFromIp(ip) {
    try {
        const { stdout } = await execAsync('arp -a');
        const lines = stdout.split('\n');
        
        for (const line of lines) {
            if (line.includes(ip)) {
                // Extrair o MAC da linha com regex mais flexível
                const macMatch = line.match(/([0-9A-Fa-f]{1,2}[:-]){5}([0-9A-Fa-f]{1,2})/);
                if (macMatch && macMatch[0]) {
                    return macMatch[0].toLowerCase();
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Erro ao obter MAC do IP:', error.message);
        return null;
    }
}

/**
 * Obtém informações sobre redes locais disponíveis
 * @returns {Array} Lista de redes disponíveis
 */
function getLocalNetworks() {
    const interfaces = os.networkInterfaces();
    const networks = [];

    for (const interfaceName in interfaces) {
        for (const iface of interfaces[interfaceName]) {
            // Considerar apenas interfaces IPv4 que não sejam internas
            if (iface.family === 'IPv4' && !iface.internal) {
                // Calcular o endereço de rede
                const ipParts = iface.address.split('.');
                const netmaskParts = iface.netmask.split('.');
                const networkAddr = ipParts.map((part, i) => 
                    (parseInt(part) & parseInt(netmaskParts[i])).toString()
                ).join('.');

                // Calcular o número de hosts baseado na máscara
                const cidr = netmaskToCidr(iface.netmask);

                networks.push({
                    interface: interfaceName,
                    address: iface.address,
                    netmask: iface.netmask,
                    cidr,
                    network: networkAddr,
                    broadcast: calculateBroadcast(iface.address, iface.netmask),
                    mac: iface.mac
                });
            }
        }
    }

    return networks;
}

/**
 * Converte máscara de rede para notação CIDR
 * @param {string} netmask - Máscara de rede (ex: 255.255.255.0)
 * @returns {number} CIDR
 */
function netmaskToCidr(netmask) {
    return netmask.split('.')
        .map(octet => parseInt(octet).toString(2).match(/1/g) || [])
        .reduce((acc, curr) => acc + curr.length, 0);
}

/**
 * Calcula o endereço de broadcast
 * @param {string} ip - Endereço IP
 * @param {string} netmask - Máscara de rede
 * @returns {string} Endereço de broadcast
 */
function calculateBroadcast(ip, netmask) {
    const ipParts = ip.split('.').map(part => parseInt(part));
    const netmaskParts = netmask.split('.').map(part => parseInt(part));
    
    return ipParts.map((part, i) => {
        return (part | (255 - netmaskParts[i])).toString();
    }).join('.');
}

/**
 * Testa a conexão com uma impressora
 * @param {string} ip - Endereço IP da impressora
 * @param {number} port - Porta da impressora
 * @returns {Promise<boolean>} true se conectou, false se não
 */
async function testPrinterConnection(ip, port = 9100) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let connected = false;
        
        socket.setTimeout(CONNECTION_TIMEOUT);
        
        socket.on('connect', () => {
            connected = true;
            socket.end();
            resolve(true);
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        try {
            socket.connect(port, ip);
        } catch {
            resolve(false);
        }
    });
}