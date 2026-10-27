'use strict';
const { MARKER } = require('./publish-build.cjs');
const REQUIRED_JOBS = ['Validate and package Windows'];
// Approval belongs to the exact artifact-producing attempt's completed validation job. The parent
// run is still in progress while its final, reusable Surge job is executing.
async function findApprovedBuild({ github, context, version, requested = '' }) {
  const pattern = /^desktop-v(\d+\.\d+\.\d+)-run-(\d+)(?:-attempt-(\d+))?$/;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(context.sha))
    throw Error('Identidade do checkout inválida.');
  if (requested && (!pattern.test(requested) || pattern.exec(requested)[1] !== version))
    throw Error('Tag inválida para a versão deste checkout.');
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  });
  const required = [
    `MN-Trono-Frontend-${version}.zip`,
    `MN-Trono-${version}-Windows.exe`,
    `SHA256SUMS-${version}.txt`,
  ];
  const candidates = releases
    .flatMap((release) => {
      const match = pattern.exec(release.tag_name || '');
      return match &&
        match[1] === version &&
        (!requested || release.tag_name === requested) &&
        release.draft &&
        release.target_commitish === context.sha &&
        release.body?.includes(MARKER) &&
        required.every((name) =>
          release.assets?.some((asset) => asset.name === name && asset.state === 'uploaded'),
        )
        ? [{ release, run: Number(match[2]), attempt: Number(match[3] || 1) }]
        : [];
    })
    .sort((a, b) => b.run - a.run || b.attempt - a.attempt);
  for (const { release, run, attempt } of candidates) {
    const { data: source } = await github.rest.actions.getWorkflowRun({
      ...context.repo,
      run_id: run,
    });
    if (source.head_sha !== context.sha || source.path !== '.github/workflows/windows-app.yml')
      continue;
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
      ...context.repo,
      run_id: run,
      filter: 'all',
      per_page: 100,
    });
    // The same consolidated job both validates and creates this attempt's artifacts.
    if (
      !REQUIRED_JOBS.every((name) =>
        jobs.some(
          (job) =>
            job.name === name &&
            Number(job.run_attempt || 1) === attempt &&
            job.conclusion === 'success',
        ),
      )
    )
      continue;
    return { tag: release.tag_name, version, sha: context.sha };
  }
  throw Error('Nenhuma entrega Windows aprovada corresponde a este commit.');
}
module.exports = { findApprovedBuild };
