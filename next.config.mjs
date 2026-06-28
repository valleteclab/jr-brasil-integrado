const nextConfig = {
  reactStrictMode: true,
  // Build "standalone": gera um server mínimo (.next/standalone) para a imagem Docker de produção.
  output: "standalone",
  experimental: {
    // O DANFE em PDF (lib nfe-danfe-pdf + PDFKit) lê assets via fs em runtime que o trace do
    // standalone não detecta sozinho: as métricas .afm das fontes built-in do PDFKit e os helpers
    // da lib carregados por deep-import. Forçamos a inclusão nas rotas de API (download de PDF).
    outputFileTracingIncludes: {
      "/api/**/*": [
        "./node_modules/pdfkit/js/data/**",
        "./node_modules/nfe-danfe-pdf/lib/**"
      ]
    }
  }
};

export default nextConfig;
