import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation - Glass Effect */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100/50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900 tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white text-sm font-bold">
              K
            </span>
            获客精灵
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-colors"
            >
              免费试用
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-48 md:pb-32">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
            社交媒体
            <br />
            <span className="text-gray-400">智能截流工具</span>
          </h1>
          <p className="mt-8 text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            自动监控抖音、快手、视频号评论区，AI 识别高意向用户，自动触达并引导至私域
          </p>
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 transition-all active:scale-95"
            >
              立即免费开始
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-medium text-gray-900 bg-gray-50 rounded-full hover:bg-gray-100 transition-all active:scale-95"
            >
              查看演示
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-400">无需信用卡，免费版永久可用</p>
        </div>
      </section>

      {/* Product Showcase - Dark Section */}
      <section className="py-24 md:py-32 bg-black text-white overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">获客精灵</p>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              让获客效率
              <br />
              <span className="text-gray-500">提升 10 倍</span>
            </h2>
          </div>
          
          {/* Dashboard Preview */}
          <div className="relative mx-auto max-w-4xl">
            <div className="relative bg-gray-900 rounded-3xl border border-gray-800 overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <div className="flex-1 text-center text-xs text-gray-500">获客精灵 Dashboard</div>
              </div>
              <div className="p-6 grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-2xl p-4">
                  <div className="text-2xl font-bold text-white">1,234</div>
                  <div className="text-xs text-gray-400 mt-1">抓取评论</div>
                </div>
                <div className="bg-gray-800 rounded-2xl p-4">
                  <div className="text-2xl font-bold text-white">89</div>
                  <div className="text-xs text-gray-400 mt-1">高意向用户</div>
                </div>
                <div className="bg-gray-800 rounded-2xl p-4">
                  <div className="text-2xl font-bold text-white">12</div>
                  <div className="text-xs text-gray-400 mt-1">今日获客</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">核心功能</h2>
            <p className="mt-4 text-lg text-gray-400">从监控到转化，全流程自动化</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-12">
            {[
              {
                icon: "M",
                title: "多平台监控",
                desc: "同时监控抖音、快手、视频号评论区，自动抓取最新评论",
              },
              {
                icon: "A",
                title: "AI 意向识别",
                desc: "基于 GPT 模型分析评论语义，自动识别购买/学习/合作意向",
              },
              {
                icon: "R",
                title: "自动触达",
                desc: "对高意向用户自动回复评论、发送私信，引导至私域",
              },
              {
                icon: "D",
                title: "数据报表",
                desc: "实时监控转化率、热门关键词、视频效果，数据驱动决策",
              },
              {
                icon: "T",
                title: "话术管理",
                desc: "预设多种场景回复模板，合规引导避免封号风险",
              },
              {
                icon: "S",
                title: "安全合规",
                desc: "智能检测违规话术，模拟人工操作频率，降低封号风险",
              },
            ].map((feature, idx) => (
              <div
                key={feature.title}
                className={`p-8 rounded-3xl ${idx === 0 || idx === 3 ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white text-sm font-bold mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 md:py-32 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">使用流程</h2>
            <p className="mt-4 text-lg text-gray-400">三步开启自动化获客</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "添加视频", desc: "粘贴抖音/快手/视频号链接，系统自动开始监控评论区" },
              { step: "2", title: "AI 分析", desc: "实时抓取评论，AI 识别高意向用户并自动评分" },
              { step: "3", title: "自动触达", desc: "对高意向用户自动回复或私信，引导至微信私域" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">价格方案</h2>
            <p className="mt-4 text-lg text-gray-400">免费开始，按需升级</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "免费版", price: "¥0", desc: "适合个人体验", features: ["监控 3 个视频", "每日 100 条评论", "基础 AI 分析", "标准话术模板"] },
              { name: "专业版", price: "¥99", period: "/月", desc: "适合中小商家", features: ["监控 50 个视频", "无限评论抓取", "高级 AI 分析", "自定义话术", "数据报表", "优先客服"], popular: true },
              { name: "企业版", price: "¥299", period: "/月", desc: "适合团队使用", features: ["无限视频监控", "无限评论抓取", "GPT-4 分析", "API 接口", "多账号管理", "专属客服"] },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`p-8 rounded-3xl ${plan.popular ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}
              >
                <div className={`text-sm font-medium ${plan.popular ? 'text-gray-400' : 'text-gray-500'}`}>{plan.name}</div>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className={`ml-1 text-sm ${plan.popular ? 'text-gray-400' : 'text-gray-500'}`}>{plan.period}</span>}
                </div>
                <p className={`mt-2 text-sm ${plan.popular ? 'text-gray-400' : 'text-gray-500'}`}>{plan.desc}</p>
                <ul className="mt-8 space-y-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <svg className={`w-5 h-5 ${plan.popular ? 'text-gray-400' : 'text-gray-900'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`mt-8 block w-full text-center py-3 rounded-full font-medium transition-colors ${
                    plan.popular
                      ? "bg-white text-gray-900 hover:bg-gray-100"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  }`}
                >
                  {plan.popular ? "立即升级" : "免费开始"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white text-sm font-bold">K</span>
              获客精灵
            </div>
            <p className="text-sm text-gray-400">© 2024 获客精灵. 让获客更简单.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
