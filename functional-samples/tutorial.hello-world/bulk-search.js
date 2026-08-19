const termsInput = document.getElementById('terms');
const separatorInput = document.getElementById('separator');
const searchButton = document.getElementById('search');
const checkRowsButton = document.getElementById('check-rows');
const clearButton = document.getElementById('clear');
const status = document.getElementById('status');
const resultsPanel = document.getElementById('results-panel');
const resultsBody = document.getElementById('results-body');

document.getElementById('back-home').addEventListener('click', () => {
	window.location.href = 'hello.html';
});

function setStatus(message, type = '') {
	status.textContent = message;
	status.className = type;
}

function renderResults(termResults) {
	resultsBody.replaceChildren();
	resultsPanel.hidden = !termResults.length;
	termResults.forEach(({ term, matches }) => {
		const row = document.createElement('tr');
		const termCell = document.createElement('td');
		const statusCell = document.createElement('td');
		const matchesCell = document.createElement('td');
		const found = matches > 0;

		row.className = found ? 'found' : 'not-found';
		termCell.textContent = term;
		statusCell.textContent = found ? 'Found' : 'Not found';
		matchesCell.textContent = String(matches);
		row.append(termCell, statusCell, matchesCell);
		resultsBody.append(row);
	});
}

function getSearchTerms() {
	const separator = separatorInput.value === 'newline' ? /\r?\n/ : separatorInput.value;
	return [...new Set(
		termsInput.value
			.split(separator)
			.map((term) => term.trim())
			.filter(Boolean),
	)];
}

async function runOnCurrentPage(action, terms = []) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.id) throw new Error('No active tab found.');

	const [{ result }] = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: (selectedTerms, requestedAction) => {
			const marker = 'data-bulk-search-highlight';
			const rowMarker = 'data-bulk-search-row-match';

			document.querySelectorAll(`[${marker}]`).forEach((element) => {
				element.replaceWith(document.createTextNode(element.textContent));
			});
			document.querySelectorAll(`[${rowMarker}]`).forEach((row) => {
				row.removeAttribute(rowMarker);
				row.style.removeProperty('outline');
				row.style.removeProperty('outline-offset');
				row.style.removeProperty('background-color');
			});

			if (requestedAction === 'clear') return { matches: 0, terms: 0, termResults: [] };

			const normalizedTerms = [...new Set(selectedTerms.map((term) => term.trim()).filter(Boolean))]
				.sort((left, right) => right.length - left.length);
			if (!normalizedTerms.length) return { matches: 0, terms: 0, termResults: [] };
			const escapedTerms = normalizedTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
			const matcher = new RegExp(escapedTerms.join('|'), 'gi');
			const termResults = normalizedTerms.map((term, index) => ({ term, matches: 0, matcher: new RegExp(escapedTerms[index], 'gi') }));
			const countTermMatches = (text) => {
				termResults.forEach((item) => {
					item.matcher.lastIndex = 0;
					item.matches += text.match(item.matcher)?.length ?? 0;
				});
			};
			const getTermResults = () => termResults.map(({ term, matches }) => ({ term, matches }));

			if (requestedAction === 'checkRows') {
				const rows = [...document.querySelectorAll('table tr')];
				const probablyclicked = [];
				const clickedIcons = new Set();
				normalizedTerms.forEach((term, termIndex) => {
					const termMatcher = new RegExp(escapedTerms[termIndex], 'i');
					rows.forEach((parentRow) => {
						if (!termMatcher.test(parentRow.textContent)) return;
						parentRow.querySelectorAll('i[id^="show_"]').forEach((actionIcon) => {
							const actionLink = actionIcon.closest('a');
							if (!actionLink) return;
							if (clickedIcons.has(actionIcon)) return;
							clickedIcons.add(actionIcon);
							probablyclicked.push({ term, parentRow, actionLink, actionIcon });
						});
					});
				});
				const matchingRows = [...new Set(probablyclicked.map(({ parentRow }) => parentRow))];
				matchingRows.forEach((row) => {
					countTermMatches(row.textContent);
					row.setAttribute(rowMarker, '');
					row.style.outline = '2px solid #34704e';
					row.style.outlineOffset = '-2px';
					row.style.backgroundColor = '#e7f3e9';
				});
				let checkedRows = 0;
				probablyclicked.forEach(({ actionLink, actionIcon }) => {
					if (actionIcon.classList.contains('fa-square-o')) {
						actionLink.click();
						checkedRows += 1;
					}
				});
				matchingRows[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return { matches: matchingRows.length, checkedRows, terms: normalizedTerms.length, termResults: getTermResults() };
			}

			const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
				acceptNode: (node) => {
					const parent = node.parentElement;
					if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) {
						return NodeFilter.FILTER_REJECT;
					}
					matcher.lastIndex = 0;
					return matcher.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
				},
			});
			const textNodes = [];
			while (walker.nextNode()) textNodes.push(walker.currentNode);

			let matches = 0;
			textNodes.forEach((node) => {
				countTermMatches(node.nodeValue);
				const fragment = document.createDocumentFragment();
				let lastIndex = 0;
				matcher.lastIndex = 0;
				node.nodeValue.replace(matcher, (match, offset) => {
					fragment.append(node.nodeValue.slice(lastIndex, offset));
					const highlight = document.createElement('mark');
					highlight.setAttribute(marker, '');
					highlight.textContent = match;
					fragment.append(highlight);
					lastIndex = offset + match.length;
					matches += 1;
					return match;
				});
				fragment.append(node.nodeValue.slice(lastIndex));
				node.replaceWith(fragment);
			});
			return { matches, terms: normalizedTerms.length, termResults: getTermResults() };
		},
		args: [terms, action],
	});
	return result;
}

searchButton.addEventListener('click', async () => {
	const terms = getSearchTerms();
	if (!terms.length) {
		setStatus('Add at least one search term.', 'error');
		termsInput.focus();
		return;
	}

	searchButton.disabled = true;
	setStatus('Searching the current page...');
	try {
		const result = await runOnCurrentPage('search', terms);
		renderResults(result.termResults);
		setStatus(`${result.matches} match${result.matches === 1 ? '' : 'es'} highlighted from ${result.terms} term${result.terms === 1 ? '' : 's'}.`, 'success');
	} catch (error) {
		setStatus('This page does not allow extension scripts.', 'error');
	} finally {
		searchButton.disabled = false;
	}
});

checkRowsButton.addEventListener('click', async () => {
	const terms = getSearchTerms();
	if (!terms.length) {
		setStatus('Add at least one search term.', 'error');
		termsInput.focus();
		return;
	}

	checkRowsButton.disabled = true;
	setStatus('Checking terms in the same table row...');
	try {
		const result = await runOnCurrentPage('checkRows', terms);
		renderResults(result.termResults);
		setStatus(`${result.checkedRows} checkbox${result.checkedRows === 1 ? '' : 'es'} clicked in ${result.matches} matching row${result.matches === 1 ? '' : 's'}.`, result.matches ? 'success' : 'error');
	} catch (error) {
		setStatus('This page does not allow extension scripts.', 'error');
	} finally {
		checkRowsButton.disabled = false;
	}
});

clearButton.addEventListener('click', async () => {
	clearButton.disabled = true;
	try {
		await runOnCurrentPage('clear');
		renderResults([]);
		setStatus('Highlights cleared.', 'success');
	} catch (error) {
		setStatus('This page does not allow extension scripts.', 'error');
	} finally {
		clearButton.disabled = false;
	}
});
