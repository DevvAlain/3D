import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-2xl rounded-2xl border border-parish-gold/30 bg-parish-night/80 p-8 shadow-2xl backdrop-blur-md">
        <span className="inline-block rounded-full border border-parish-gold/40 bg-parish-gold/10 px-4 py-1 text-xs font-semibold tracking-wider text-parish-gold uppercase">
          Giáo Xứ Thánh Tâm
        </span>
        <h1 className="mt-4 font-serif text-4xl font-bold tracking-tight text-parish-goldLight sm:text-5xl">
          Quay Số May Mắn
        </h1>
        <p className="mt-4 text-base text-parish-cream/80 sm:text-lg">
          Hệ thống quay số trúng thưởng trang trọng, minh bạch và an toàn tuyệt đối với sân khấu 3D lộng lẫy.
        </p>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/display"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-parish-gold to-parish-goldLight px-6 py-3 text-base font-bold text-parish-navy shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-parish-gold/30"
          >
            Màn Hình Chiếu Sân Khấu (Display)
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-xl border border-parish-gold/40 bg-parish-navy/60 px-6 py-3 text-base font-semibold text-parish-goldLight transition-all duration-200 hover:bg-parish-gold/20"
          >
            Bảng Quản Trị Hậu Trường (Admin)
          </Link>
        </div>
      </div>
    </main>
  );
}
