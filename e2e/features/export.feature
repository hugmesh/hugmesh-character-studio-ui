# Export — download the composed character as a PNG (B0 §4, download path).
#
# OFFLINE (@-untagged): "Download PNG" rasterises the composed SVG onto an
# offscreen <canvas> and triggers a browser download entirely in-browser — no
# backend. (The other export button, "Set as Matrix avatar", posts to the
# off-stack character-bff and lives in avatar.feature, tagged @cluster.) The
# scenario asserts a REAL download event with a `.png` filename, not just a click.
Feature: Export downloads the character as PNG
  As someone who finished a character
  I want to download it as a PNG
  So that I have a file I can use anywhere

  Scenario: downloading the character produces a PNG file
    Given the character studio is loaded
    When I download the character PNG
    Then a PNG file is downloaded
    And the export status reads "Downloaded PNG."
