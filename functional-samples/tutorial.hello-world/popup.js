const termsInput = document.getElementById('terms');
const separatorInput = document.getElementById('separator');
const searchButton = document.getElementById('search');
const clearButton = document.getElementById('clear');
const status = document.getElementById('status');

function setStatus(message, type = '') {
	status.textContent = message;
	status.className = type;
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

			document.querySelectorAll(`[${marker}]`).forEach((element) => {
				element.replaceWith(document.createTextNode(element.textContent));
			});

			if (requestedAction === 'clear') return { matches: 0, terms: 0 };

			const normalizedTerms = [...new Set(selectedTerms.map((term) => term.trim()).filter(Boolean))]
				.sort((left, right) => right.length - left.length);
			if (!normalizedTerms.length) return { matches: 0, terms: 0 };

			const escapedTerms = normalizedTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
			const matcher = new RegExp(escapedTerms.join('|'), 'gi');
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
			return { matches, terms: normalizedTerms.length };
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
		setStatus(`${result.matches} match${result.matches === 1 ? '' : 'es'} highlighted from ${result.terms} term${result.terms === 1 ? '' : 's'}.`, 'success');
	} catch (error) {
		setStatus('This page does not allow extension scripts.', 'error');
	} finally {
		searchButton.disabled = false;
	}
});

clearButton.addEventListener('click', async () => {
	clearButton.disabled = true;
	try {
		await runOnCurrentPage('clear');
		setStatus('Highlights cleared.', 'success');
	} catch (error) {
		setStatus('This page does not allow extension scripts.', 'error');
	} finally {
		clearButton.disabled = false;
	}
});
