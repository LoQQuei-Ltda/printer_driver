using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace PrintMonitor
{
    public class ApiClient
    {
        private readonly HttpClient _httpClient;
        private readonly string _baseUrl;
        private string _authToken = string.Empty;

        public ApiClient(string baseUrl)
        {
            _baseUrl = baseUrl;
            _httpClient = new HttpClient();
            _httpClient.DefaultRequestHeaders.Accept.Clear();
            _httpClient.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
            _httpClient.Timeout = TimeSpan.FromSeconds(30);
        }

        public void SetAuthToken(string token)
        {
            _authToken = token ?? string.Empty;
            _httpClient.DefaultRequestHeaders.Remove("Authorization");
            if (!string.IsNullOrEmpty(token))
            {
                _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {token}");
            }
        }

        public async Task<LoginResponse> LoginAsync(string username, string password)
        {
            // NOTE: For testing purposes, this method is mocked
            // In a real application, this would make an actual HTTP request

            await Task.Delay(1000); // Simulate network delay
            
            // Mock successful login
            return new LoginResponse
            {
                Success = true,
                Token = Guid.NewGuid().ToString(),
                ExpiresAt = DateTime.Now.AddDays(1),
                User = new UserInfo
                {
                    Id = "12345",
                    Username = username,
                    Email = $"{username}@example.com",
                    CompanyId = "67890",
                    CompanyName = "Test Company"
                },
                Message = "Login successful"
            };
        }

        public async Task<List<PrinterInfo>> GetPrintersAsync()
        {
            // Mock API response for printers
            await Task.Delay(800); // Simulate network delay

            return new List<PrinterInfo>
            {
                new PrinterInfo
                {
                    Id = "12345",
                    Name = "LoQQuei Printer",
                    IPAddress = "10.148.1.147",
                    Port = 9100,
                    DriverName = "Microsoft IPP Class Driver",
                    Location = "Office",
                    IsEnabled = true
                }
            };
        }

        public async Task<ApiResponse> SendPrintJobAsync(PrintJobData printJob)
        {
            // Mock API response for sending print job data
            await Task.Delay(500); // Simulate network delay

            return new ApiResponse
            {
                Success = true,
                Message = "Print job recorded successfully"
            };
        }

        // In a real implementation, these methods would make actual HTTP requests
        private async Task<T?> GetAsync<T>(string endpoint) where T : class
        {
            HttpResponseMessage response = await _httpClient.GetAsync($"{_baseUrl}{endpoint}");
            response.EnsureSuccessStatusCode();
            string json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(json);
        }

        private async Task<T?> PostAsync<T>(string endpoint, object data) where T : class
        {
            string jsonContent = JsonSerializer.Serialize(data);
            var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");
            
            HttpResponseMessage response = await _httpClient.PostAsync($"{_baseUrl}{endpoint}", content);
            response.EnsureSuccessStatusCode();
            
            string json = await response.Content.ReadAsStringAsync();
            return JsonSerializer.Deserialize<T>(json);
        }
    }

    public class LoginResponse
    {
        public bool Success { get; set; }
        public string Token { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
        public UserInfo User { get; set; } = new UserInfo();
        public string Message { get; set; } = string.Empty;
    }

    public class ApiResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}