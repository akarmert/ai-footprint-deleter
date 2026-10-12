class AnalysisError(RuntimeError):
    pass


class AnalysisCancelled(AnalysisError):
    pass


class MemoryBudgetExceeded(AnalysisError):
    pass


class SourceChanged(AnalysisError):
    pass


def check_cancelled(cancelled):
    if cancelled is not None and cancelled():
        raise AnalysisCancelled('Analysis cancelled')
