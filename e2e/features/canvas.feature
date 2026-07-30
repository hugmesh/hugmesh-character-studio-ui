# Canvas — the SVG-DOM compositor renders the character to the preview <img>.
#
# OFFLINE (@-untagged): on load the studio seeds a default character (first part of
# every slot) and composes it into a data:image/svg+xml URL with at least one
# z-ordered <g> layer; with all required slots (body/head/eyes) filled the validity
# note reads "Ready to export". No backend.
Feature: Canvas composes and reports validity
  As someone opening the studio
  I want the default character rendered and its readiness shown
  So that I know the studio is working and whether it is exportable

  Scenario: the studio composes the default character on load
    Given the character studio is loaded
    Then the canvas renders a composed character
    And the validity note reads "Ready to export"
