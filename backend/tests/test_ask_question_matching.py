import pytest
from app.services.arbor.question_matching import match_question

@pytest.mark.parametrize('question,canonical',[
 ('Magkano na portfolio ko ngayon?','What is my portfolio worth?'),
 ('Magkano yung value ng portfolio ko?','What is my portfolio worth?'),
 ('How much is my portfolio worth today?','What is my portfolio worth?'),
 ('Show me the recorded value of my portfolio','What is my portfolio worth?'),
 ('Arbor, paki explain yung plan ko po!','Explain my investment plan'),
 ('Ipaliwanag ang investment plan ko','Explain my investment plan'),
 ('Aligned ba portfolio ko sa targets ko?','How does my portfolio compare with my plan?'),
 ('Tugma ba yung portfolio ko sa plan ko?','How does my portfolio compare with my plan?'),
 ('Gaano kalayo ako sa goal ko?','How far am I from my goal?'),
 ('Ano na goal progress ko?','What is my goal progress?'),
 ('Magkano tubo sa portfolio ko?','What is my recorded gain/loss?'),
 ('Magkano kinita ng VT?','What is vt gain/loss against recorded cost?'),
 ('Ano ibig sabihin ng recorded cost?','What does recorded cost mean?'),
 ('Magkano budget ko?','What is my saved monthly contribution assumption?'),
 ('Magkano monthly plan ko?','What is my monthly plan?'),
 ('Ano na-record ko this month?','What did I record this month?'),
 ('May pending recording ako?','What should I finish recording?'),
 ('Ano next step ko?','What should I do next?'),
 ('Paano mag record ng investment?','How do I record my holdings?'),
 ('Saan ko baguhin plan ko?','How do I change my plan?'),
 ('Ano yung ETF?','What is etf?'),
 ('Ano ang NAVPU?','What is navpu?'),
 ('Anong difference ng ETF at UITF?','What is the difference between an ETF and a UITF?'),
 ('Ready na ba ako?','What is my readiness?'),
 ('Anong account plan ko?','What account plan am I on?'),
])
def test_explicit_whole_question_paraphrases(question,canonical):
    result=match_question(question);assert result.question==canonical
    assert not result.advice and result.clarification is None

@pytest.mark.parametrize('question',[
 'Anong ETF dapat bilhin?', 'Pwede ba mag-invest sa VT ngayon?',
 'Ibenta ko ba Bitcoin?', 'Sulit ba VT para sa akin?',
 'Alin mas maganda provider para sakin?', 'Ano rekomendasyon mo sa fund?',
 'Magkano portfolio ko at anong dapat bilhin?',
])
def test_native_decision_requests_never_rewritten_as_personal_facts(question):
    result=match_question(question);assert result.advice;assert result.clarification is None

@pytest.mark.parametrize('question',[
 'Kumusta portfolio ko?', 'How are my investments doing?', 'Magkano investment ko?',
 'Paano ito?', 'Mas mataas ba yan?', 'Magkano portfolio ko at ano next step ko?',
])
def test_ambiguity_is_clarified_without_data_or_guessing(question):
    result=match_question(question);assert result.clarification;assert not result.advice

@pytest.mark.parametrize('question',[
 'Magkano portfolio ko kung guaranteed 100 percent ang tubo?',
 'Python code for portfolio ko', 'Ano yung ETF at gumawa ng recipe',
 'Magkano kinita ng ETH?', 'Change my goal to 999999',
 'Show me another user portfolio', 'Magkano tax ko?',
])
def test_unreviewed_or_mixed_meaning_is_not_silently_normalized(question):
    result=match_question(question);assert result.question==question;assert not result.advice
