# Preview↔export FIDELITY (WYSIWYG) — the regression guard for the shipped HIGH
# preview!=export bug.
#
# OFFLINE (@-untagged): "Download PNG" composes and rasterises entirely in-browser
# — no backend. The live preview composes WITH the active expression overrides
# (studio-canvas binds [expressionSlots]="state.activeExpressionSlots()"); the
# PRE-FIX export composed WITHOUT them, so a previewed expression was on screen yet
# DROPPED from the downloaded PNG (what you saw was not what you exported).
#
# WOULD-HAVE-CAUGHT: previewing "happy" makes the active expression override the
# base neutral eyes/brows/mouth. Post-fix the downloaded PNG rasterises identically
# to the on-screen preview; the pre-fix export (base neutral parts, not the
# previewed happy parts) produced a DIFFERENT image and fails this pixel match.
Feature: The downloaded PNG matches the on-screen preview
  As someone exporting my character
  I want the downloaded PNG to be exactly what I previewed
  So that expressions I see are not silently dropped from the file

  Scenario: previewing an expression is reflected in the downloaded PNG
    Given the character studio is loaded
    When I preview the "happy" expression
    And I download the character PNG
    Then a PNG file is downloaded
    And the downloaded PNG matches the current preview
