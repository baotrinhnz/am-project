# Ambience Monitor Project Information

## 🌐 Deployment URLs

### Vercel Dashboard
- **Project URL:** https://vercel.com/baotrinh-2433s-projects/am-project
- **Live Dashboard:** (will be available after deployment completes)

### GitHub Repository
- **Repo URL:** https://github.com/baotrinhnz/am-project

---

## 🔑 Supabase Configuration

### Project Details
- **Project URL:** https://hqdfdbgupnfgxfxfdvjn.supabase.co
- **Region:** ap-northeast-1
- **Database:** PostgreSQL

### API Keys
- **Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGZkYmd1cG5mZ3hmeGZkdmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzczMDQsImV4cCI6MjA4ODA1MzMwNH0.NTVDp-1S2nELW8fWyGdf589px3MKJexn5OP5HLlN40Y
- **Service Role Key:** (stored in raspberry-pi/.env - DO NOT COMMIT)

### Database
- **Host:** aws-1-ap-northeast-1.pooler.supabase.com
- **Port:** 6543 (Transaction Pooler)
- **Database:** postgres
- **User:** postgres.hqdfdbgupnfgxfxfdvjn

---

## 📂 Project Structure

```
am-project/
├── dashboard/              # Next.js Dashboard (Vercel)
│   ├── app/
│   │   ├── page.js        # Main dashboard page
│   │   ├── layout.js      # Root layout
│   │   └── globals.css    # Tailwind styles
│   ├── lib/
│   │   └── supabase.js    # Supabase client
│   └── .env.local         # Local env (not committed)
├── raspberry-pi/          # Sensor reader (Python)
│   ├── sensor_reader.py   # Main script
│   ├── .env               # Config (not committed)
│   └── requirements.txt   # Python dependencies
└── supabase/
    └── schema.sql         # Database schema
```

---

## 🚀 Deployment Status

- ✅ GitHub Repository Created
- ✅ Code Pushed to GitHub
- ✅ Vercel Project Created
- ⏳ Waiting for Environment Variables Configuration
- ⏳ Waiting for Deployment to Complete

---

## 🔧 Environment Variables (Vercel)

Required variables for dashboard deployment:

```
NEXT_PUBLIC_SUPABASE_URL = https://hqdfdbgupnfgxfxfdvjn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZGZkYmd1cG5mZ3hmeGZkdmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzczMDQsImV4cCI6MjA4ODA1MzMwNH0.NTVDp-1S2nELW8fWyGdf589px3MKJexn5OP5HLlN40Y
```

---

## 📝 Notes

- **Project Owner:** BaoT
- **Device ID:** rpi-enviro-01
- **Created:** 2026-03-03
- **Local Dev:** http://localhost:3001
- **Database Table:** sensor_readings (15 columns)
- **Mock Data:** Available for testing without hardware

---

## 🎯 Next Steps

1. Configure environment variables on Vercel
2. Wait for deployment to complete
3. Enable Realtime on Supabase (Database → Replication → sensor_readings)
4. Test with mock data: `python raspberry-pi/sensor_reader.py --interval 10`
5. Setup Raspberry Pi with actual sensors (when ready)
