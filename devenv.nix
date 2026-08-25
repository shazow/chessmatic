{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm = {
      enable = true;
      install.enable = true;
    };
  };

  packages = [ pkgs.playwright-driver.browsers ];

  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };

  scripts = {
    run = {
      description = "Start the Vite development server";
      exec = "npm run dev";
    };

    check = {
      description = "Run all project checks";
      exec = "npm run validate";
    };

    check-puzzles = {
      description = "Verify the stored puzzle pars";
      exec = "npm run puzzles:check";
    };
  };

  enterTest = ''
    npm run validate
  '';
}
