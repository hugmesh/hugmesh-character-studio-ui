# Responsive layout — the studio on phone (360x740) and tablet (768x1024 /
# 1024x768) viewports.
#
# OFFLINE, viewport-projects only: @responsive scenarios are EXCLUDED from the
# desktop `bdd` project (grepInvert) and run in the `bdd-phone` /
# `bdd-tablet` / `bdd-tablet-landscape` projects (playwright.config.ts), which
# emulate touch (coarse pointer ⇒ the 44px target rule applies). The sticky
# stacked-preview scenario is additionally @phone — the stacked layout only
# engages below the 768px tablet breakpoint, so it is phone-project-only.

@responsive
Feature: Studio layout fits phone and tablet viewports
  As someone building a character on a phone or tablet
  I want the studio to fit my screen with reachable controls
  So that the big new packs are usable without pinching and panning

  Scenario: the studio renders without horizontal overflow on menagerie
    Given the character studio is loaded
    When I switch to the "menagerie-v1" pack expecting 12 slots
    Then the page has no horizontal scroll
    And the canvas preview fits inside the viewport width
    When I scroll to the bottom of the page
    Then the page has no horizontal scroll

  Scenario: header controls meet the touch-target minimum
    Given the character studio is loaded
    Then the studio controls meet the 44 pixel touch-target minimum

  @phone
  Scenario: the stacked preview stays visible while the picker scrolls
    Given the character studio is loaded
    When I switch to the "menagerie-v1" pack expecting 12 slots
    And I scroll to the bottom of the page
    Then the canvas preview is still visible in the viewport
    And the page has no horizontal scroll
