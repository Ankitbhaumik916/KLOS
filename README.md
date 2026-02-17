# KLOS - Cloudkitchen AI Order Management System

[![GitHub](https://img.shields.io/badge/GitHub-Ankitbhaumik916/KLOS-blue)](https://github.com/Ankitbhaumik916/KLOS)
![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.2.0-646CFF?logo=vite)
![License](https://img.shields.io/badge/License-MIT-green)

> **KLOS** is an intelligent order management and analysis platform designed for cloud kitchen operations. It combines real-time dashboards, AI-powered insights, and advanced data analytics to optimize operations and decision-making.

## 🚀 Features

### Core Functionality
- **📊 Dashboard** - Real-time order metrics, revenue tracking, and performance indicators
- **📋 Order Management** - Live order tracking, status updates, and order history
- **📈 Data Grid** - Interactive data table with advanced filtering and sorting capabilities
- **⚙️ Settings** - User preferences, API configuration, and system settings

### AI-Powered Features
- **🤖 Gemini Insights** - AI-generated business insights and recommendations powered by Google's Gemini API
- **🧠 AI Deep Dive** - Advanced analysis using Retrieval-Augmented Generation (RAG) with local Llama 3.2 model for intelligent pattern recognition and strategic recommendations

### Data Processing
- **📁 CSV Import** - Seamless upload and parsing of order history data
- **🔐 User Authentication** - Secure login and session management
- **💾 Local Storage** - Persistent data storage for offline access

## 🛠️ Tech Stack

- **Frontend Framework:** React 19.2.0
- **Language:** TypeScript 5.8.2
- **Build Tool:** Vite 6.2.0
- **UI Components:** Custom React components with Tailwind CSS
- **AI Integration:** 
  - Google Gemini API (cloud-based)
  - Ollama + Llama 3.2 (local inference)
- **Data Visualization:** Recharts
- **NLP/ML:** Hugging Face Transformers.js
- **Backend Proxy:** Express.js with CORS support

## 📋 Prerequisites

- **Node.js** v16 or higher
- **npm** or **yarn** package manager
- **Google Gemini API Key** (for AI insights)
- **Ollama** (for AI Deep Dive feature)

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Ankitbhaumik916/KLOS.git
cd KLOS
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the project root:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

Get your Gemini API key from: https://ai.google.dev/

### 4. Optional: Setup AI Deep Dive (RAG System)

For local AI analysis capabilities, install Ollama:

**Windows Users - Automated Setup:**
```bash
# Simply run the batch script
setup-ollama.bat
```

**Manual Setup (All Platforms):**

```bash
# 1. Download Ollama from https://ollama.ai
# 2. Install Ollama and verify installation
ollama --version

# 3. Download Llama 3.2 model (~4.7GB)
ollama pull llama3.2

# 4. Start Ollama server (in a separate terminal)
ollama serve
```

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

### Start LLM Proxy (for AI Deep Dive)

In a separate terminal:

```bash
npm run start-llm-proxy
```

## 📁 Project Structure

```
├── components/              # React components
│   ├── Dashboard.tsx       # Main dashboard view
│   ├── DataGrid.tsx        # Order data table
│   ├── LiveOrders.tsx      # Real-time order feed
│   ├── GeminiInsight.tsx   # AI insights panel
│   ├── AIDeepdive.tsx      # RAG-based analysis
│   ├── Login.tsx           # Authentication
│   ├── Settings.tsx        # User settings
│   └── ConnectModal.tsx    # Connection dialog
├── services/               # Business logic
│   ├── authService.ts      # User authentication
│   ├── csvService.ts       # CSV parsing
│   ├── geminiService.ts    # Gemini API integration
│   ├── ragDssService.ts    # RAG decision support
│   ├── qaService.ts        # Q&A functionality
│   ├── storageService.ts   # Data persistence
│   └── agentService.ts     # Agent coordination
├── tools/                  # Utilities
│   └── llm-proxy/         # LLM proxy server
├── order_history/         # Sample order data
├── App.tsx                # Main application
├── index.tsx              # React entry point
├── types.ts               # TypeScript definitions
└── vite.config.ts         # Vite configuration
```

## 💡 Feature Details

### Dashboard
- Order count and revenue metrics
- Average customer ratings
- Completion rate analytics
- Real-time status indicators

### AI Insights (Gemini)
- Automated business recommendations
- Performance analysis
- Trend identification
- Quick recommendations

### AI Deep Dive (RAG + Llama)
The RAG system provides intelligent analysis by:
1. **Semantic Search** - Finding similar historical orders
2. **Context Building** - Creating rich contextual information
3. **LLM Analysis** - Generating strategic recommendations

### Data Management
- Upload CSV order files
- Filter and sort order data
- Export analytics
- View historical trends

## 🔐 Authentication

The application includes a simple authentication system. Default credentials can be configured in settings.

For production deployment, integrate with:
- OAuth 2.0 providers
- Enterprise SSO
- JWT-based authentication

## 🌐 Deployment

### Vercel (Recommended)

```bash
npm run build
# Deploy the 'dist' folder to Vercel
```

The project includes `vercel.json` for automatic Vercel deployment.

### Other Platforms

The build output is in the `dist` directory and can be deployed to any static hosting service (Netlify, GitHub Pages, AWS S3, etc.).

## ⚙️ Configuration

### API Keys

Set in `.env.local`:
```env
VITE_GEMINI_API_KEY=your_key_here
VITE_OLLAMA_URL=http://localhost:11434
```

### Customization

- Modify `types.ts` for data structure changes
- Update `services/` for API integrations
- Customize components in `components/` folder
- Adjust styling in component files

## 📊 Sample Data

The project includes historical order data in the `order_history_20251127_20251207/` directory with 1134+ orders spanning multiple weeks for testing and analysis.

## 🐛 Troubleshooting

### Gemini API Issues
- Verify API key is correct in `.env.local`
- Check Google Cloud project quotas
- Ensure API is enabled in Google Cloud Console

### AI Deep Dive Not Working
- Verify Ollama is running: `http://localhost:11434`
- Check Llama 3.2 model is downloaded: `ollama list`
- Run LLM proxy: `npm run start-llm-proxy`

### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
npm run build
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add feature description"`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a Pull Request

## 📝 License

This project is licensed under the MIT License - see LICENSE file for details.

## 👤 Author

**Ankit Bhaumik**
- GitHub: [@Ankitbhaumik916](https://github.com/Ankitbhaumik916)
- Project: [KLOS Repository](https://github.com/Ankitbhaumik916/KLOS)

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review the RAG_DSS_GUIDE.md for AI features

---

**Made with ❤️ for optimizing cloud kitchen operations**
