const axios = require('axios');

module.exports = {
    printSync: async () => {
        const { appConfig, userData } = require('../main');
        
        try {
            const response = await axios.get(`${appConfig.apiLocalUrl}/sync`);

            let data
            if (response.status === 200) {
                data = response.data?.data;
            } else {
                return;
            }

            if (!data || !data.length || data.length == 0) {
                return;
            }
            
            const synceds = [];
            for (const file of data) {
                if (!file.printed) {
                    continue;
                }

                let fileResponse
                try {
                    fileResponse = await axios.post(`${appConfig.apiPrincipalServiceUrl}/desktop/printedByUser`, {
                        fileId: file.id,
                        date: file.createdat,
                        assetId: file.assetid,
                        pages: file.pages
                    }, {
                        headers: {
                            'Authorization': `Bearer ${userData.token}`
                        }
                    })
                } catch (error) {
                    console.log(error?.response?.data);
                }

                if (!fileResponse || fileResponse.status !== 200) {
                    console.error(fileResponse);

                    if (!fileResponse.errors) {
                        continue;
                    }

                    const fileError = fileResponse.errors.find(error => error.file);

                    if (!fileError) {
                        continue;
                    }

                    if (fileError.file != 'Arquivo já está no banco de dados!') {
                        continue;
                    }
                }

                synceds.push(file.id);
            }

            if (!synceds || synceds.length == 0) {
                return;
            }
            
            try {
                await axios.post(`${appConfig.apiLocalUrl}/sync`, {
                    files: synceds
                });
            } catch (error) {
                console.log(error?.response?.data);
            }

            return
        } catch (error) {
            console.log(error?.response?.data);
        }
    }
}