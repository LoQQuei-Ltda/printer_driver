using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace PrintMonitor
{
    public class UserInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        
        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;
        
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
        
        [JsonPropertyName("companyId")]
        public string CompanyId { get; set; } = string.Empty;
        
        [JsonPropertyName("companyName")]
        public string CompanyName { get; set; } = string.Empty;
    }

    public class AuthData
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;
        
        [JsonPropertyName("user")]
        public UserInfo User { get; set; } = new UserInfo();
        
        [JsonPropertyName("expiresAt")]
        public DateTime ExpiresAt { get; set; }
    }

    public class PrinterInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;
        
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        
        [JsonPropertyName("ipAddress")]
        public string IPAddress { get; set; } = string.Empty;
        
        [JsonPropertyName("port")]
        public int Port { get; set; } = 9100;
        
        [JsonPropertyName("driverName")]
        public string DriverName { get; set; } = "Microsoft Print To PDF";
        
        [JsonPropertyName("location")]
        public string Location { get; set; } = string.Empty;
        
        [JsonPropertyName("isEnabled")]
        public bool IsEnabled { get; set; } = true;
    }

    public class PrintJobData
    {
        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;
        
        [JsonPropertyName("printerId")]
        public string PrinterId { get; set; } = string.Empty;
        
        [JsonPropertyName("printerName")]
        public string PrinterName { get; set; } = string.Empty;
        
        [JsonPropertyName("documentName")]
        public string DocumentName { get; set; } = string.Empty;
        
        [JsonPropertyName("jobId")]
        public string JobId { get; set; } = string.Empty;
        
        [JsonPropertyName("pages")]
        public int Pages { get; set; }
        
        [JsonPropertyName("timestamp")]
        public DateTime Timestamp { get; set; } = DateTime.Now;
        
        [JsonPropertyName("companyId")]
        public string CompanyId { get; set; } = string.Empty;
    }
    
    public class PrintJobInfo
    {
        [JsonPropertyName("JobId")]
        public int? JobId { get; set; }
        
        [JsonPropertyName("DocumentName")]
        public string DocumentName { get; set; } = string.Empty;
        
        [JsonPropertyName("TotalPages")]
        public int TotalPages { get; set; }
    }
}