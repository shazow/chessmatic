{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
  };

  scripts = {
    check = {
      description = "Run all project checks";
      exec = ''
        node --test
        node solve-puzzles.js --check
      '';
    };

    check-puzzles = {
      description = "Verify the stored puzzle pars";
      exec = "node solve-puzzles.js --check";
    };
  };

  enterTest = ''
    check
  '';
}
