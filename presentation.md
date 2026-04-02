# Presentation Script

## Slide 1: QA Testing

I did three types of testing. Functional testing to make sure every feature works as expected. Performance testing to check if the system stays stable when many users use it at the same time. And penetration testing to find any security issues.

## Slide 2: Functional Testing Tools

I used MCP Playwright to run end-to-end tests on the web app using AI. Google Sheets to track all test cases and bug reports in one place. And App Script to automatically log bugs when a test fails.

## Slide 3: Test Case Total

I made 196 test cases — mostly negative (51%) to check how the system handles bad input, then positive (39%), and the rest are edge and boundary cases. Boundary is small because this app works with status changes and file uploads, not numbers.

## Slide 4: Bug Report Schema

When a test fails, App Script automatically creates a bug ticket with a snapshot. Risk level is assigned manually. Once fixed and updated to PASS, the bug status changes to CLOSED — but the bug report keeps the original record so we have a history of what went wrong. A demo video will be shown in the next slide.

## Slide 5: Functional Testing Report

All 196 test cases passed with 100% pass rate. 27 bugs were found and fixed during testing, all now closed.

## Slide 6: Performance Testing Tools

I used four tools. k6 as the main CLI tool to run performance tests. boto3 for Python seeder and cleanup scripts that manage test data. Make to orchestrate all commands in one place. And Lighthouse for frontend performance testing.

## Slide 7: Chosen Feature

I selected two features for testing — Assets and Employee Dashboard. Assets gets all four test types. Employee Dashboard only gets smoke and volume testing.

## Slide 8: Load Testing Report (Assets)

I simulated 10 people opening the asset feature on 5 minutes. After optimization, features load 48% faster on average, and 42% faster for 95% of users.

## Slide 9: Stress Testing Report (Assets)

I pushed the system up to 200 simultaneous users. The system didn't show any signs of failing. As we can see it has 0% error rate.

## Slide 10: Volume Testing Report (Assets)

So for volume testing, Before optimization, the more data in the system, the slower it got. After optimization, the speed stays stable no matter how much data there is — up to 87% faster at 500 records.

## Slide 11: Volume Testing Report (Dashboard Employee)

For the employee dashboard. Before optimization, when an employee had 20 assets assigned, the feature completely failed — almost 100% errors. After optimization, it loads in under 100ms with zero errors.

## Slide 12: Frontend Performance Testing — Lighthouse Scores

Most pages scored 90+ across all three aspects (performance, accessibility, and best practice). 3 pages scored below 90 on accessibility which can be improved in the future.

## Slide 13: Penetration Testing Tools

I used AWS Security Agent to run penetration tests.

## Slide 14: Penetration Test Report

The system passed all security tests — zero findings across all severity levels. Everything is secured.
