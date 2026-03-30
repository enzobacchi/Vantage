import Link from "next/link"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left column: Logo + Form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center md:justify-start">
          <Link href="/" className="flex items-center">
            <img
              src="/vantage-wordmark-dark.png"
              alt="Vantage"
              className="h-9 w-auto dark:hidden"
            />
            <img
              src="/vantage-wordmark-light.png"
              alt="Vantage"
              className="hidden h-9 w-auto dark:block"
            />
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/* Right column: Branded panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#007A3F] to-[#21E0D6] lg:flex lg:flex-col lg:items-center lg:justify-center">
        {/* Decorative circles */}
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-32 size-[30rem] rounded-full bg-white/5" />

        <img
          src="/vantage-icon.png"
          alt=""
          className="relative mb-8 size-20 brightness-0 invert opacity-30"
        />
        <h2 className="relative max-w-xs text-center text-2xl font-bold text-white">
          Donor Intelligence for Growing Nonprofits
        </h2>
        <p className="relative mt-3 max-w-xs text-center text-sm text-white/80">
          AI-powered CRM that connects to your accounting software
        </p>
      </div>
    </div>
  )
}
