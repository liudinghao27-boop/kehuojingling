import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-500">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20" />
        
        <nav className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl">
                🎯
              </span>
              <span className="text-xl font-bold text-white">获客精灵</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm text-white/80 hover:text-white transition-colors">
                登录
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-blue-600 bg-white hover:bg-white/90 transition-colors"
              >
                免费试用
              </Link>
            </div>
          </div>
        </nav>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">
              社交媒体
              <span className="block mt-2 bg-gradient-to-r from-yellow-300 to-pink-300 bg-clip-text text-transparent">
                智能截流工具
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-white/80 leading-relaxed">
              自动监控抖音/快手/视频号评论区，AI 识别高意向用户，
              <br className="hidden sm:block" />
              自动触达并引导至私域，让获客效率提升 10 倍
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-semibold text-blue-600 bg-white hover:bg-white/90 transition-all shadow-lg shadow-blue-900/20"
              >
                立即免费开始
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-semibold text-white border-2 border-white/30 hover:bg-white/10 transition-all"
              >
                查看演示
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/60">无需信用卡，免费版永久可用</p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: "10万+", label: "已抓取评论" },
                { value: "5千+", label: "高意向用户" },
                { value: "98%", label: "AI 识别准确率" },
                { value: "3x", label: "获客效率提升" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                  <div className="mt-1 text-sm text-white/60">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900">核心功能</h2>
            <p className="mt-4 text-lg text-gray-600">从监控到转化，全流程自动化</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: "🎥",
                title: "多平台监控",
                desc: "同时监控抖音、快手、视频号评论区，自动抓取最新评论",
                color: "from-blue-500 to-cyan-400",
              },
              {
                icon: "🧠",
                title: "AI 意向识别",
                desc: "基于 GPT 模型分析评论语义，自动识别购买/学习/合作意向",
                color: "from-purple-500 to-pink-400",
              },
              {
                icon: "🤖",
                title: "自动触达",
                desc: "对高意向用户自动回复评论、发送私信，引导至私域",
                color: "from-green-500 to-emerald-400",
              },
              {
                icon: "📝",
                title: "话术管理",
                desc: "预设多种场景回复模板，合规引导避免封号风险",
                color: "from-orange-500 to-yellow-400",
              },
              {
                icon: "📊",
                title: "数据报表",
                desc: "实时监控转化率、热门关键词、视频效果，数据驱动决策",
                color: "from-red-500 to-rose-400",
              },
              {
                icon: "🔒",
                title: "安全合规",
                desc: "智能检测违规话术，模拟人工操作频率，降低封号风险",
                color: "from-gray-500 to-slate-400",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900">使用流程</h2>
            <p className="mt-4 text-lg text-gray-600">三步开启自动化获客</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "添加视频",
                desc: "粘贴抖音/快手/视频号链接，系统自动开始监控评论区",
              },
              {
                step: "02",
                title: "AI 分析",
                desc: "实时抓取评论，AI 识别高意向用户并自动评分",
              },
              {
                step: "03",
                title: "自动触达",
                desc: "对高意向用户自动回复或私信，引导至微信私域",
              },
            ].map((item, idx) => (
              <div key={item.step} className="relative">
                <div className="bg-gray-50 rounded-2xl p-8">
                  <div className="text-5xl font-bold text-gray-200 mb-4">{item.step}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-gray-900">价格方案</h2>
            <p className="mt-4 text-lg text-gray-600">免费开始，按需升级</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                name: "免费版",
                price: "¥0",
                desc: "适合个人体验",
                features: ["监控 3 个视频", "每日 100 条评论抓取", "基础 AI 分析", "标准话术模板"],
                cta: "免费开始",
                popular: false,
              },
              {
                name: "专业版",
                price: "¥99",
                period: "/月",
                desc: "适合中小商家",
                features: ["监控 50 个视频", "无限评论抓取", "高级 AI 分析", "自定义话术", "数据报表", "优先客服"],
                cta: "立即升级",
                popular: true,
              },
              {
                name: "企业版",
                price: "¥299",
                period: "/月",
                desc: "适合团队使用",
                features: ["无限视频监控", "无限评论抓取", "GPT-4 分析", "API 接口", "多账号管理", "专属客服"],
                cta: "联系销售",
                popular: false,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 ${
                  plan.popular
                    ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-xl scale-105"
                    : "bg-white text-gray-900 shadow-sm border border-gray-100"
                }`}
              >
                <div className="text-sm font-medium opacity-80">{plan.name}</div>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className={`ml-1 ${plan.popular ? "text-white/60" : "text-gray-500"}`}>{plan.period}</span>}
                </div>
                <p className={`mt-2 text-sm ${plan.popular ? "text-white/70" : "text-gray-500"}`}>{plan.desc}</p>
                <ul className="mt-6 space-y-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${plan.popular ? "text-green-300" : "text-green-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-8 block w-full text-center py-3 rounded-xl font-semibold transition-colors ${
                    plan.popular
                      ? "bg-white text-blue-600 hover:bg-white/90"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <span className="text-xl font-bold">获客精灵</span>
            </div>
            <p className="text-gray-400 text-sm">© 2024 获客精灵. 让获客更简单.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
