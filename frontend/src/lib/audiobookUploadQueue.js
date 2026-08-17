export const applyAudiobookUploadConflicts = (candidateFiles, conflicts) => {
  const conflictsByPath = new Map((conflicts || []).map(file => [file.relativePath, file.status]));

  return candidateFiles.map(file => {
    const conflictStatus = conflictsByPath.get(file.path);
    if (conflictStatus === 'duplicate') {
      return { ...file, status: 'duplicate', progress: 100 };
    }
    if (conflictStatus === 'conflict') {
      return {
        ...file,
        status: 'error',
        error: 'A different file already exists at this server path.'
      };
    }
    return file;
  });
};
