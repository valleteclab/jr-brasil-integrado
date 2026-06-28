const nextConfig = {
  reactStrictMode: true,
  // Build "standalone": gera um server mínimo (.next/standalone) para a imagem Docker de produção.
  output: "standalone",
  experimental: {
    // PDFKit lê dados (.afm das fontes built-in) via fs relativo ao seu __dirname. Se o webpack o
    // bundla, esse caminho quebra em runtime. Mantemos pdfkit e a lib do DANFE como pacotes
    // EXTERNOS (resolvidos de node_modules, não bundlados) — o tracer (@vercel/nft) então segue os
    // requires a partir do entry e inclui o código + deps transitivas no standalone.
    serverComponentsExternalPackages: ["pdfkit", "nfe-danfe-pdf"],
    // Os .afm são lidos por fs (não require), então o tracer não os vê: forçamos a inclusão deles
    // (e dos helpers da lib usados por deep-import) nas rotas de API que geram o PDF.
    outputFileTracingIncludes: {
      "/api/**/*": [
        "./node_modules/pdfkit/**",
        "./node_modules/nfe-danfe-pdf/lib/**"
      ]
    }
  }
};

export default nextConfig;
