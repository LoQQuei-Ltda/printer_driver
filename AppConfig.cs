using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace PrintMonitor
{
    public class AppConfig
    {
        private const string CONFIG_FILENAME = "config.json";
        private const string AUTH_FILENAME = "auth.json";
        
        private string _configPath;
        private string _authPath;
        
        private ConfigData _configData = new ConfigData();
        private AuthData? _authData = null;

        public AppConfig(string appDataDirectory)
        {
            if (!Directory.Exists(appDataDirectory))
            {
                Directory.CreateDirectory(appDataDirectory);
            }
            
            _configPath = Path.Combine(appDataDirectory, CONFIG_FILENAME);
            _authPath = Path.Combine(appDataDirectory, AUTH_FILENAME);
            
            LoadConfig();
            LoadAuth();
        }
        
        // Configuration properties
        public int TotalPageCount 
        { 
            get => _configData.TotalPageCount;
            set 
            { 
                _configData.TotalPageCount = value;
                SaveConfig();
            }
        }
        
        public int UpdateIntervalMinutes
        {
            get => _configData.UpdateIntervalMinutes;
            set
            {
                _configData.UpdateIntervalMinutes = value;
                SaveConfig();
            }
        }
        
        public string ApiBaseUrl
        {
            get => _configData.ApiBaseUrl;
            set
            {
                _configData.ApiBaseUrl = value ?? string.Empty;
                SaveConfig();
            }
        }
        
        // Auth properties
        public string AuthToken => _authData?.Token ?? string.Empty;
        public UserInfo CurrentUser => _authData?.User ?? new UserInfo();
        public bool IsAuthenticated => _authData != null && !string.IsNullOrEmpty(_authData.Token) && _authData.ExpiresAt > DateTime.Now;
        
        // Load and save configuration
        private void LoadConfig()
        {
            try
            {
                if (File.Exists(_configPath))
                {
                    string json = File.ReadAllText(_configPath);
                    var loadedConfig = JsonSerializer.Deserialize<ConfigData>(json);
                    
                    if (loadedConfig != null)
                    {
                        _configData = loadedConfig;
                    }
                    else
                    {
                        // Create default configuration if deserialization returned null
                        _configData = new ConfigData
                        {
                            TotalPageCount = 0,
                            UpdateIntervalMinutes = 60,
                            ApiBaseUrl = "https://api.example.com"
                        };
                        SaveConfig();
                    }
                }
                else
                {
                    // Create default configuration
                    _configData = new ConfigData
                    {
                        TotalPageCount = 0,
                        UpdateIntervalMinutes = 60,
                        ApiBaseUrl = "https://api.example.com"
                    };
                    SaveConfig();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading configuration: {ex.Message}");
                // Create default configuration
                _configData = new ConfigData
                {
                    TotalPageCount = 0,
                    UpdateIntervalMinutes = 60,
                    ApiBaseUrl = "https://api.example.com"
                };
            }
        }
        
        private void SaveConfig()
        {
            try
            {
                string json = JsonSerializer.Serialize(_configData, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_configPath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving configuration: {ex.Message}");
            }
        }
        
        // Load and save auth data
        private void LoadAuth()
        {
            try
            {
                if (File.Exists(_authPath))
                {
                    string json = File.ReadAllText(_authPath);
                    _authData = JsonSerializer.Deserialize<AuthData>(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading auth data: {ex.Message}");
                _authData = null;
            }
        }
        
        public void SaveAuth(string token, UserInfo user, DateTime expiresAt)
        {
            try
            {
                _authData = new AuthData
                {
                    Token = token ?? string.Empty,
                    User = user ?? new UserInfo(),
                    ExpiresAt = expiresAt
                };
                
                string json = JsonSerializer.Serialize(_authData, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_authPath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving auth data: {ex.Message}");
            }
        }
        
        public void ClearAuth()
        {
            try
            {
                _authData = null;
                if (File.Exists(_authPath))
                {
                    File.Delete(_authPath);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error clearing auth data: {ex.Message}");
            }
        }
    }
    
    public class ConfigData
    {
        public int TotalPageCount { get; set; }
        public int UpdateIntervalMinutes { get; set; } = 60;
        public string ApiBaseUrl { get; set; } = "https://api.example.com";
    }
}