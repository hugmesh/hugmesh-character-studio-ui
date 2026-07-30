# Credits / attribution — the in-app rendering of a pack's REQUIRED attribution.
#
# OFFLINE (@-untagged): pack manifests are static assets; the studio renders the
# active pack's `attribution` string (when present) in a Credits section with no
# backend. srd-taxonomy-v1 carries the mandated verbatim SRD 5.1 attribution — the
# license REQUIRES it be shown to end users, not merely shipped in ATTRIBUTION.txt.
#
# NON-VACUOUS: base-anthro-v1 (the default pack) carries NO attribution, so its
# Credits section is ABSENT — proving the section is conditional, not a static
# always-present element. Switching to srd-taxonomy-v1 then reveals the real
# license text (a stable substring of the pack's verbatim attribution).
Feature: Sourced packs show their attribution to end users
  As a user of a pack built on licensed material
  I want the required attribution rendered in the app
  So that the studio honours the source license (SRD 5.1 CC-BY-4.0)

  Scenario: the SRD-sourced pack renders its attribution while an unsourced pack shows none
    Given the character studio is loaded
    Then no credits section is shown
    When I switch to the "srd-taxonomy-v1" pack expecting 4 slots
    Then the credits show "System Reference Document 5.1"
    And the credits show "Creative Commons Attribution 4.0"
