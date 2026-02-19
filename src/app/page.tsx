
import Link from "next/link"
import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  BarChart3,
  Clock,
  FileText,
  MessageSquare,
  Building2,
  ChevronRight
} from "lucide-react"

export default async function LandingPage() {
  const session = await getSession()

  if (session) {
    redirect("/projects")
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-50 font-sans text-surface-900">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-surface-200 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold">
              M
            </div>
            <span className="text-lg font-bold tracking-tight text-surface-900">MilestoneHQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-surface-600">
            <Link href="#features" className="hover:text-primary-600 transition-colors">Features</Link>
            <Link href="#how-it-works" className="hover:text-primary-600 transition-colors">How it works</Link>
            <Link href="#testimonials" className="hover:text-primary-600 transition-colors">Testimonials</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm font-medium text-surface-600 hover:text-surface-900 hidden sm:block">
              Log in
            </Link>
            <Link href="/auth/login"> {/* In a real app this might be /auth/signup */}
              <Button size="sm">Start Free Demo</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-24 lg:pt-32 lg:pb-40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <Badge variant="secondary" className="mb-6 animate-fade-in hover:bg-surface-200 cursor-default">
              <span className="text-primary-600 mr-2">New</span>
              AI-Powered Risk Analysis
            </Badge>
            <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-surface-900 sm:text-6xl mb-6 animate-slide-up-fade [animation-delay:200ms]">
              Execution Visibility for <br className="hidden sm:block" />
              <span className="text-primary-600">Construction Projects</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-surface-600 mb-10 animate-slide-up-fade [animation-delay:400ms]">
              Stop flying blind. Track milestones, automate audits, and release payments with evidence-based confidence. The operating system for modern project delivery.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up-fade [animation-delay:600ms]">
              <Link href="/auth/login">
                <Button size="lg" className="w-full sm:w-auto px-8">
                  Start Free Demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="outline" size="lg" className="w-full sm:w-auto px-8">
                  View Live Demo
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Abstract Background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl -z-10 opacity-30 pointer-events-none">
            <div className="absolute top-[20%] left-[10%] w-72 h-72 bg-primary-200 rounded-full blur-[100px]" />
            <div className="absolute top-[10%] right-[10%] w-96 h-96 bg-blue-100 rounded-full blur-[120px]" />
          </div>

          {/* Hero Dashboard Preview (Mock) */}
          <div className="container mx-auto px-4 mt-16 lg:mt-24 animate-slide-up-fade [animation-delay:800ms]">
            <div className="rounded-xl border border-surface-200 bg-white/50 backdrop-blur-sm p-2 shadow-2xl shadow-primary-900/10 max-w-5xl mx-auto">
              <div className="rounded-lg border border-surface-200 bg-white overflow-hidden aspect-[16/9] relative group">
                {/* Simulated Dashboard UI */}
                <div className="absolute inset-0 bg-surface-50 flex items-center justify-center">
                  <div className="w-full h-full p-8 flex flex-col gap-6">
                    {/* Header Mock */}
                    <div className="h-8 w-1/3 bg-surface-200 rounded animate-pulse opacity-50"></div>
                    {/* Grid Mock */}
                    <div className="grid grid-cols-3 gap-6 flex-1">
                      <div className="col-span-2 bg-white rounded-lg border border-surface-200 p-4 shadow-sm flex flex-col gap-3">
                        <div className="h-6 w-32 bg-surface-100 rounded"></div>
                        <div className="space-y-2">
                          <div className="h-10 w-full bg-surface-50 rounded"></div>
                          <div className="h-10 w-full bg-surface-50 rounded"></div>
                          <div className="h-10 w-full bg-surface-50 rounded"></div>
                        </div>
                      </div>
                      <div className="col-span-1 bg-white rounded-lg border border-surface-200 p-4 shadow-sm">
                        <div className="h-6 w-20 bg-surface-100 rounded mb-4"></div>
                        <div className="h-24 w-24 rounded-full border-4 border-primary-100 mx-auto mb-4"></div>
                        <div className="h-4 w-full bg-surface-50 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Overlay Text */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="secondary" className="shadow-lg">Example Dashboard View</Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof */}
        <section className="border-y border-surface-100 bg-white py-12">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-8">Trusted by industry leaders</p>
            <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 grayscale opacity-60">
              {/* Placeholder Logos */}
              <div className="flex items-center gap-2 font-bold text-xl text-surface-800"><Building2 className="h-6 w-6" /> ACME Corp</div>
              <div className="flex items-center gap-2 font-bold text-xl text-surface-800"><ShieldCheck className="h-6 w-6" /> SecureBuild</div>
              <div className="flex items-center gap-2 font-bold text-xl text-surface-800"><BarChart3 className="h-6 w-6" /> DataConstruct</div>
              <div className="flex items-center gap-2 font-bold text-xl text-surface-800"><Building2 className="h-6 w-6" /> Metro Group</div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-surface-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl font-bold tracking-tight text-surface-900 sm:text-4xl mb-4">
                Everything you need to control project delivery
              </h2>
              <p className="text-lg text-surface-600">
                A complete operating system for specialized project management and auditing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureCard
                icon={<BarChart3 className="h-6 w-6 text-primary-600" />}
                title="Evidence-Based Progress"
                description="Track every milestone with mandatory photo/document evidence. No more 'I think it's done'—know it's done."
              />
              <FeatureCard
                icon={<ShieldCheck className="h-6 w-6 text-primary-600" />}
                title="Payment Eligibility Automation"
                description="Automatically calculate payment eligibility based on verified milestones. Reduce disputes and accelerate cycles."
              />
              <FeatureCard
                icon={<FileText className="h-6 w-6 text-primary-600" />}
                title="Audit Trail"
                description="Immutable logs for every action, approval, and rejection. Full accountability for compliance and owners."
              />
              <FeatureCard
                icon={<Clock className="h-6 w-6 text-primary-600" />}
                title="Vendor Performance"
                description="Rate and track vendors based on timeliness and quality. data-driven decisions for future contracting."
              />
              <FeatureCard
                icon={<MessageSquare className="h-6 w-6 text-primary-600" />}
                title="WhatsApp Integration"
                description="Send automated updates and nudge reminders directly to vendors' phones. Meet them where they work."
              />
              <FeatureCard
                icon={<CheckCircle2 className="h-6 w-6 text-primary-600" />}
                title="Smart Reports"
                description="Generate executive summaries and BOQ status reports in one click. PDF or Excel exports ready for the boardroom."
              />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-white border-y border-surface-100">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-surface-900">How MilestoneHQ Works</h2>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-12 relative">
              {/* Connecting Line (Desktop) */}
              <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-surface-200 -z-10" />

              <Step
                number="1"
                title="Define Milestones"
                desc="Upload your BOQ and set clear, evidence-backed milestones for vendors."
              />
              <Step
                number="2"
                title="Submit Evidence"
                desc="Vendors upload photos and docs. AI assists in verifying validity."
              />
              <Step
                number="3"
                title="Approve & Pay"
                desc="Review visual proof. One-click approval triggers payment workflows."
              />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-surface-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-primary-600/10 pattern-grid-lg opacity-20" />
          <div className="container mx-auto px-4 text-center relative z-10">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">Start managing projects with clarity</h2>
            <p className="text-primary-100 text-lg max-w-2xl mx-auto mb-10">
              Join forward-thinking owners and PMCs who have switched to evidence-first execution.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/auth/login">
                <Button size="lg" className="bg-white text-surface-900 hover:bg-surface-100 border-none w-full sm:w-auto">
                  Get Started Now
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="outline" size="lg" className="border-surface-600 text-white hover:bg-surface-800 hover:text-white hover:border-surface-500 w-full sm:w-auto">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-surface-50 border-t border-surface-200 py-12 text-sm">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-surface-900 font-bold">
            <div className="h-6 w-6 rounded bg-surface-900 text-white flex items-center justify-center text-xs">M</div>
            MilestoneHQ
          </div>
          <div className="flex gap-8 text-surface-500">
            <Link href="#" className="hover:text-surface-900">Privacy</Link>
            <Link href="#" className="hover:text-surface-900">Terms</Link>
            <Link href="#" className="hover:text-surface-900">Support</Link>
          </div>
          <div className="text-surface-400">
            &copy; {new Date().getFullYear()} MilestoneHQ. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white rounded-xl border border-surface-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-12 w-12 rounded-lg bg-surface-50 flex items-center justify-center mb-4 border border-surface-100">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-2">{title}</h3>
      <p className="text-surface-600 leading-relaxed">{description}</p>
    </div>
  )
}

function Step({ number, title, desc }: { number: string, title: string, desc: string }) {
  return (
    <div className="flex flex-col items-center text-center max-w-sm bg-white p-6 md:bg-transparent md:p-0 rounded-xl md:rounded-none shadow-sm md:shadow-none border md:border-none border-surface-200">
      <div className="h-10 w-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-lg mb-4 shadow-lg shadow-primary-500/20 z-10 relative">
        {number}
      </div>
      <h3 className="text-lg font-semibold text-surface-900 mb-2">{title}</h3>
      <p className="text-surface-500 text-sm leading-relaxed">{desc}</p>
    </div>
  )
}
