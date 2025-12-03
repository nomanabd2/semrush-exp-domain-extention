# Semrush RPC Data Interceptor

A Chrome extension + Node.js server that intercepts and stores Semrush API (RPC) calls for SEO data analysis.

## 📁 Project Structure

```
Smeush/
├── semrush_extention/          # Chrome Extension
│   ├── manifest.json           # Extension config
│   ├── background.js           # Service worker - captures RPC calls
│   ├── content.js              # Content script
│   ├── interceptor.js          # Network interceptor (MAIN world)
│   └── icons/                  # Extension icons
│
└── server/                     # Node.js API Server
    ├── index.js                # Express server
    ├── package.json            # Dependencies
    └── rpc_data.json           # Captured RPC data (auto-generated)
```

## 🚀 Quick Start

### 1. Start the Server

```bash
cd server
npm install
node index.js
```

Server runs at `http://localhost:3000`

### 2. Install Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `semrush_extention` folder

### 3. Capture Data

1. Go to Semrush (noxtools.com or semrush.pw)
2. Search for a domain
3. RPC data is automatically captured and sent to the server

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/rpc` | Get all captured data |
| GET | `/api/rpc/:domain` | Get data for specific domain |
| GET | `/api/stats` | Get statistics |
| GET | `/api/rpc/cleanup` | Cleanup UI (browser) |
| POST | `/api/rpc` | Save RPC entry |
| POST | `/api/rpc/cleanup` | Remove blacklisted methods |
| DELETE | `/api/rpc` | Clear all data |
| DELETE | `/api/rpc/:domain` | Clear domain data |

## 🎯 Captured RPC Methods (Useful Data)

| Method | Description |
|--------|-------------|
| `organic.Summary` | Traffic, positions, rank by country |
| `organic.PositionsOverview` | Top keywords with positions & traffic |
| `organic.CompetitorsOverview` | Competitor domains analysis |
| `organic.OverviewTrend` | Historical traffic trends |
| `backlinks.Summary` | Authority score, backlinks count |
| `backlinks.Overview` | Detailed backlinks with anchors |

## 🚫 Filtered Methods (Blacklisted)

These methods are automatically filtered out:

- `dpa.IsRootDomain`
- `organic.AiTopSources`
- `organic.TopicsStatus`
- `organic.AiSeoSummary`
- `organic.AiDistributionByCountry`
- `organic.SERPFeatures`
- `adwords.CompetitorsOverview`
- `adwords.CompetitorsTotal`
- `adwords.PositionsOverview`
- `currency.Rates`
- `user.Databases`
- `user.Info`
- `user.Limits`
- `user.Settings`

## 🧹 Data Cleanup

To remove blacklisted entries from existing data:

**Option 1: Browser UI**
```
http://localhost:3000/api/rpc/cleanup
```

**Option 2: API Call**
```bash
curl -X POST http://localhost:3000/api/rpc/cleanup
```

## 📋 Example Data Structure

```json
{
  "example.com": [
    {
      "id": "rpc_1234567890_abc123",
      "url": "https://semrush3.semrush.pw/dpa/rpc",
      "requestBody": "{\"method\":\"organic.Summary\",...}",
      "responseBody": { "result": {...} },
      "timestamp": "2025-12-01T10:00:00.000Z"
    }
  ]
}
```

## ⚙️ Configuration

### Add/Remove Filtered Methods

Edit `GENERIC_METHODS` array in:
- `server/index.js` (server-side filtering)
- `semrush_extention/background.js` (extension-side filtering)

### Change Server Port

Edit `PORT` constant in `server/index.js`

## 📝 License

MIT
