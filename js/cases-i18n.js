// Traducción del contenido clínico de los casos (inglés y portugués).
// Se registra en el diccionario de la interfaz: el texto en español de cada campo se toma del propio caso,
// así que corregir un caso en español no rompe la traducción (solo deja ese campo sin traducir).
import { CASES, METAL_ITEMS } from './cases.js';
import { ARTIFACT_CASES, ARTIFACT_TYPES } from './artifacts.js';
import { addTranslations } from './i18n.js';

// Campos: t título · o orden · h antecedentes · a alergias · p embarazo · q pregunta · op opciones · e explicación. [inglés, portugués]
const TR = {
  'craneo-hic': {
    t: ['Unenhanced head CT — acute neurological deficit', 'TC de crânio sem contraste — déficit neurológico agudo'],
    o: ['URGENT unenhanced head CT. Left hemiparesis and sudden headache for 1 h. Stroke code. Agitated patient.', 'TC de crânio SEM contraste urgente. Hemiparesia esquerda e cefaleia súbita há 1 h. Código AVC. Paciente agitado.'],
    h: ['Poorly controlled hypertension. Anticoagulated with warfarin. Glasgow Coma Scale 13/15.', 'HAS mal controlada. Anticoagulado com varfarina. Escala de Glasgow 13/15.'],
    q: ['What is the main finding?', 'Qual é o achado principal?'],
    op: [['No acute abnormality', 'Intraparenchymal haematoma in the RIGHT hemisphere', 'Intraparenchymal haematoma in the LEFT hemisphere', 'Bilateral subdural haematoma'],
      ['Estudo sem alterações agudas', 'Hematoma intraparenquimatoso no hemisfério DIREITO', 'Hematoma intraparenquimatoso no hemisfério ESQUERDO', 'Hematoma subdural bilateral']],
    e: ['Hyperdense collection (~65 HU) with a rim of oedema in the right capsuloganglionic/temporoparietal region. Remember the radiological convention: the patient’s right is on the left of the image. Left hemiparesis matches a right-sided lesion. In an agitated patient the head must be immobilised (head holder and strap) to avoid motion artefacts.',
      'Coleção hiperdensa (~65 HU) com halo de edema na região capsulonuclear/temporoparietal direita. Lembre a convenção radiológica: a direita do paciente aparece à esquerda da imagem. A hemiparesia esquerda é compatível com lesão à direita. Num paciente agitado é preciso fixar a cabeça (suporte e faixa) para evitar artefatos de movimento.'],
  },
  'angio-tep': {
    t: ['CT pulmonary angiography — suspected PE', 'Angio-TC de artérias pulmonares — suspeita de TEP'],
    o: ['Chest CT angiography (PE protocol). Sudden dyspnoea, tachycardia, D-dimer 2,400 ng/mL. After knee replacement surgery.', 'Angio-TC de tórax (protocolo TEP). Dispneia súbita, taquicardia, dímero D 2.400 ng/mL. Pós-operatório de artroplastia de joelho.'],
    h: ['Dyspnoea: tolerates short breath-holds (≈ 10 s).', 'Dispneia: tolera apneias curtas (≈ 10 s).'],
    a: ['Penicillin', 'Penicilina'],
    p: ['Not applicable (postmenopausal)', 'Não se aplica (pós-menopausa)'],
    q: ['What does the study show?', 'O que o estudo mostra?'],
    op: [['Pulmonary arteries without filling defects', 'Filling defect in the RIGHT pulmonary artery and its lower lobe branch (PE)', 'Filling defect in the LEFT pulmonary artery', 'Aortic dissection'],
      ['Artérias pulmonares sem falhas de enchimento', 'Falha de enchimento na artéria pulmonar DIREITA e no ramo lobar inferior (TEP)', 'Falha de enchimento na artéria pulmonar ESQUERDA', 'Dissecção de aorta']],
    e: ['Hypodense filling defects (~40 HU) inside the right pulmonary artery and the right lower lobe artery, surrounded by contrast. Seeing them requires > 250 HU in the pulmonary arteries: bolus tracking in the pulmonary trunk, high flow (≥ 4 mL/s), saline chaser and a fast acquisition (short breath-hold).',
      'Falhas de enchimento hipodensas (~40 HU) na artéria pulmonar direita e na artéria lobar inferior direita, rodeadas de contraste. Para vê-las é preciso realce > 250 HU nas artérias pulmonares: bolus tracking no tronco pulmonar, fluxo alto (≥ 4 mL/s), bolus de soro e aquisição rápida (apneia curta).'],
  },
  'higado-trifasico': {
    t: ['Triple-phase liver CT — cirrhosis with a nodule', 'TC de fígado trifásica — cirrose com nódulo'],
    o: ['Triple-phase upper abdominal CT (liver): unenhanced, late arterial and portal venous. HCV cirrhosis; 3 cm nodule on ultrasound. Raised AFP.', 'TC de abdome superior trifásica (fígado): sem contraste, arterial tardia e portal. Cirrose por VHC; nódulo de 3 cm na ultrassonografia. AFP elevada.'],
    h: ['Fasting for 6 h. No previous contrast reactions.', 'Jejum de 6 h. Sem antecedentes de reação ao contraste.'],
    q: ['How does the liver nodule behave?', 'Como se comporta o nódulo hepático?'],
    op: [['Hypodense in all phases (cyst)', 'Intense arterial enhancement and portal venous washout (hepatocellular carcinoma pattern)', 'Peripheral nodular progressive enhancement (haemangioma)', 'No lesion is seen'],
      ['Hipodenso em todas as fases (cisto)', 'Realce arterial intenso e washout na fase portal (padrão de carcinoma hepatocelular)', 'Realce periférico nodular e progressivo (hemangioma)', 'Nenhuma lesão identificada']],
    e: ['The right lobe nodule enhances strongly in the late arterial phase (when the liver still enhances little) and becomes hypodense to the parenchyma in the portal venous phase: arterial enhancement with washout, typical of hepatocellular carcinoma. If the arterial phase is acquired too early or too late, the lesion-to-liver contrast is lost.',
      'O nódulo do lobo direito capta muito na fase arterial tardia (quando o fígado ainda capta pouco) e fica hipodenso em relação ao parênquima na fase portal: realce arterial com washout, típico do carcinoma hepatocelular. Se a fase arterial for adquirida cedo ou tarde demais, o contraste entre lesão e fígado se perde.'],
  },
  urolitiasis: {
    t: ['Low-dose unenhanced CT urography — renal colic', 'Urotomografia sem contraste de baixa dose — cólica renal'],
    o: ['UNENHANCED CT urography (low-dose protocol). Left flank pain radiating to the groin, haematuria.', 'Urotomografia SEM contraste (protocolo de baixa dose). Dor lombar esquerda irradiada para a virilha, hematúria.'],
    h: ['First episode. Pregnancy ruled out.', 'Primeiro episódio. Gravidez descartada.'],
    p: ['Urine pregnancy test: NEGATIVE (today)', 'Teste de gravidez na urina: NEGATIVO (hoje)'],
    q: ['What is the finding?', 'Qual é o achado?'],
    op: [['No stones or dilatation', 'LEFT ureteric stone with proximal collecting system dilatation', 'RIGHT ureteric stone', 'Acute appendicitis'],
      ['Sem cálculos nem dilatação', 'Cálculo ureteral ESQUERDO com dilatação da via excretora proximal', 'Cálculo ureteral DIREITO', 'Apendicite aguda']],
    e: ['Hyperdense stone (> 900 HU) in the left lumbar ureter with hydronephrosis and a dilated ureter above it. Stones are visible without contrast: the protocol must be unenhanced and low-dose (CTDIvol ≤ 10 mGy) and cover from the upper renal poles to the bladder base.',
      'Cálculo hiperdenso (> 900 HU) no ureter lombar esquerdo com hidronefrose e ureter dilatado acima. Os cálculos são vistos sem contraste: o protocolo deve ser sem contraste e de baixa dose (CTDIvol ≤ 10 mGy) e cobrir dos polos renais superiores até a base da bexiga.'],
  },
  contraindicacion: {
    t: ['Contrast-enhanced abdomen and pelvis CT — oncology follow-up', 'TC de abdome e pelve com contraste — controle oncológico'],
    o: ['Abdomen and pelvis CT WITH contrast. Follow-up of operated colon cancer.', 'TC de abdome e pelve COM contraste. Controle de câncer de cólon operado.'],
    h: ['Type 2 diabetes (metformin), stage 4 chronic kidney disease.', 'Diabetes tipo 2 (metformina), doença renal crônica estágio 4.'],
    a: ['Iodinated contrast: generalised urticaria and bronchospasm (2022)', 'Contraste iodado: urticária generalizada e broncoespasmo (2022)'],
    q: ['What is the correct action regarding contrast?', 'Qual é a conduta correta com o contraste?'],
    op: [['Inject contrast as ordered', 'Do not inject: previous severe reaction and eGFR < 30. Inform the radiologist, who decides whether to scan unenhanced, change modality or premedicate', 'Inject half the dose without telling anyone', 'Inject and give an antihistamine afterwards'],
      ['Injetar o contraste conforme o pedido', 'Não injetar: reação prévia grave e TFG < 30. Avisar o radiologista, que decide se faz sem contraste, muda de técnica ou pré-medica', 'Injetar metade da dose sem avisar', 'Injetar e dar anti-histamínico depois']],
    e: ['The patient has a previous moderate-to-severe allergic reaction to iodinated contrast and severely reduced renal function (eGFR 24 mL/min/1.73 m²), and takes metformin. The technologist must not inject: suspend administration and consult the radiologist, who weighs risks and benefits (unenhanced study, another modality or premedication in a prepared setting).',
      'O paciente tem reação alérgica prévia moderada-grave ao contraste iodado e função renal muito reduzida (TFG 24 mL/min/1,73 m²), além de metformina. O técnico não deve injetar: deve suspender a administração e consultar o radiologista, que avalia risco-benefício (estudo sem contraste, outra técnica ou pré-medicação em ambiente preparado).'],
  },
  'torax-nodulo': {
    t: ['Low-dose chest CT — nodule follow-up', 'TC de tórax de baixa dose — seguimento de nódulo'],
    o: ['UNENHANCED low-dose chest CT. Smoker, 40 pack-years. Pulmonary nodule follow-up.', 'TC de tórax SEM contraste de baixa dose. Fumante de 40 maços-ano. Controle de nódulo pulmonar.'],
    h: ['Asymptomatic.', 'Assintomático.'],
    q: ['Where is the nodule?', 'Onde está o nódulo?'],
    op: [['There are no nodules', 'RIGHT upper lobe', 'LEFT upper lobe', 'Left lower lobe'], ['Não há nódulos', 'Lobo superior DIREITO', 'Lobo superior ESQUERDO', 'Lobo inferior esquerdo']],
    e: ['Solid ~10 mm nodule in the (anterior) right upper lobe. Screening and nodule follow-up use thin slices (≤ 1.25 mm) with a lung kernel and a very low dose (CTDIvol ≤ 3 mGy): lung has very high natural contrast and tolerates noise.',
      'Nódulo sólido de ~10 mm no lobo superior direito (anterior). No rastreamento e no seguimento de nódulos usam-se cortes finos (≤ 1,25 mm) com filtro de pulmão e dose muito baixa (CTDIvol ≤ 3 mGy): o pulmão tem contraste natural muito alto e tolera o ruído.'],
  },
  'diseccion-aortica': {
    t: ['Aortic CT angiography — tearing chest pain', 'Angio-TC de aorta — dor torácica lancinante'],
    o: ['URGENT CT angiography of the thoracic and abdominal aorta. Sudden chest pain radiating to the back. Blood pressure difference between arms.', 'Angio-TC de aorta torácica e abdominal URGENTE. Dor torácica súbita irradiada para o dorso. Diferença de pressão arterial entre os braços.'],
    h: ['Long-standing hypertension. BP 190/110 mmHg. Normal troponin.', 'HAS de longa data. PA 190/110 mmHg. Troponina normal.'],
    q: ['What is the diagnosis?', 'Qual é o diagnóstico?'],
    op: [['Normal aorta', 'DESCENDING aortic dissection (Stanford B) with intimal flap and double lumen', 'Ascending aortic dissection (Stanford A)', 'Pulmonary embolism'],
      ['Aorta normal', 'Dissecção da aorta DESCENDENTE (Stanford B) com flap intimal e luz dupla', 'Dissecção da aorta ascendente (Stanford A)', 'Tromboembolismo pulmonar']],
    e: ['A linear membrane (intimal flap) inside the descending aorta separates a true lumen, which enhances strongly in the arterial phase, from a false lumen that enhances later and less. The ascending aorta and arch are spared: Stanford type B dissection. Assessment needs a well-timed arterial phase (aorta > 250 HU) covering from the supra-aortic vessels to the iliac arteries.',
      'Uma membrana linear (flap intimal) dentro da aorta descendente separa uma luz verdadeira, que realça muito na fase arterial, de uma falsa luz que realça mais tarde e menos. A aorta ascendente e o arco estão poupados: dissecção tipo B de Stanford. A avaliação exige fase arterial bem sincronizada (aorta > 250 HU) cobrindo dos troncos supra-aórticos até as ilíacas.'],
  },
  'cuello-absceso': {
    t: ['Contrast-enhanced neck CT — suspected abscess', 'TC de pescoço com contraste — suspeita de abscesso'],
    o: ['Neck CT WITH contrast. Odynophagia, fever of 39 °C, trismus and a painful left neck mass.', 'TC de pescoço COM contraste. Odinofagia, febre de 39 °C, trismo e massa cervical esquerda dolorosa.'],
    h: ['Tonsillitis 10 days ago treated with amoxicillin. Leucocytosis.', 'Amigdalite há 10 dias tratada com amoxicilina. Leucocitose.'],
    p: ['Serum β-hCG: NEGATIVE (yesterday)', 'β-hCG no sangue: NEGATIVO (ontem)'],
    q: ['What does the study show?', 'O que o estudo mostra?'],
    op: [['Normal neck', 'LEFT neck collection with rim enhancement (abscess)', 'RIGHT neck collection', 'Lymph nodes without a collection'],
      ['Pescoço normal', 'Coleção cervical ESQUERDA com realce periférico (abscesso)', 'Coleção cervical DIREITA', 'Linfonodos sem coleção']],
    e: ['Hypodense collection (~18 HU) with an enhancing wall in the left posterior cervical space: abscess. The inflamed wall takes up contrast and the fluid centre does not. It is acquired in the venous phase (~60–70 s), with the shoulders down and asking the patient not to swallow.',
      'Coleção hipodensa (~18 HU) com parede que realça no espaço cervical posterior esquerdo: abscesso. A parede inflamada capta contraste e o centro líquido não. Adquire-se na fase venosa (~60–70 s), com os ombros baixos e pedindo à paciente que não engula.'],
  },
  'trauma-bazo': {
    t: ['Chest, abdomen and pelvis CT — polytrauma', 'TC de tórax, abdome e pelve — politraumatismo'],
    o: ['Chest, abdomen and pelvis CT WITH contrast (trauma protocol). Motorbike accident. Left upper quadrant pain, tachycardia.', 'TC de tórax, abdome e pelve COM contraste (protocolo de trauma). Acidente de moto. Dor no hipocôndrio esquerdo, taquicardia.'],
    h: ['Glasgow 15. Positive FAST in the left upper quadrant. Arrives with a relative.', 'Glasgow 15. FAST positivo no quadrante superior esquerdo. Chega acompanhado por um familiar.'],
    q: ['What is the main finding?', 'Qual é o achado principal?'],
    op: [['No traumatic injuries', 'SPLENIC laceration with haemoperitoneum', 'Liver laceration', 'Tension pneumothorax'], ['Sem lesões traumáticas', 'Laceração ESPLÊNICA com hemoperitônio', 'Laceração hepática', 'Pneumotórax hipertensivo']],
    e: ['A linear non-enhancing hypodense band crosses the spleen (laceration), with dense fluid (~40 HU, blood) around the spleen and in the pelvis (haemoperitoneum). In the portal venous phase the splenic parenchyma enhances homogeneously and the laceration stands out. The trauma protocol covers from the lung apices to the symphysis in a single acquisition.',
      'Faixa hipodensa linear que atravessa o baço e não realça (laceração), com líquido denso (~40 HU, sangue) ao redor do baço e na pelve (hemoperitônio). Na fase portal o parênquima esplênico realça de forma homogênea e a laceração se destaca. O protocolo de trauma cobre numa única aquisição dos ápices até a sínfise.'],
  },
  'protesis-cadera': {
    t: ['Pelvic CT — painful hip prosthesis', 'TC de pelve — prótese de quadril dolorosa'],
    o: ['UNENHANCED pelvic CT. Right total hip replacement 3 months ago, pain and fever. Rule out a periprosthetic collection.', 'TC de pelve SEM contraste. Prótese total de quadril direito há 3 meses, dor e febre. Descartar coleção periprotética.'],
    h: ['Raised C-reactive protein. Cannot lift the right leg.', 'Proteína C-reativa elevada. Não consegue elevar a perna direita.'],
    p: ['Not applicable (76 years old)', 'Não se aplica (76 anos)'],
    q: ['What is seen around the prosthesis?', 'Que achado há ao redor da prótese?'],
    op: [['Nothing: only metal artefacts', 'Periprosthetic fluid collection lateral to the RIGHT hip', 'Left pubic fracture', 'Prosthesis dislocation'], ['Nenhum: só artefatos metálicos', 'Coleção líquida periprotética lateral ao quadril DIREITO', 'Fratura do púbis esquerdo', 'Luxação da prótese']],
    e: ['Lateral to the right prosthesis there is a fluid collection (~15 HU) consistent with a periprosthetic collection/abscess. Without metal artefact reduction (MAR) the dark and bright streaks from the metal hide it. Besides MAR, higher kV, slightly thicker slices and adequate mAs help.',
      'Lateral à prótese direita há uma coleção líquida (~15 HU) compatível com coleção/abscesso periprotético. Sem redução de artefatos metálicos (MAR) as faixas escuras e brilhantes que saem do metal a escondem. Além do MAR ajudam kV mais alto, cortes um pouco mais grossos e mAs suficientes.'],
  },
  coronario: {
    t: ['Coronary CT angiography — stable chest pain', 'Angio-TC coronária — dor torácica estável'],
    o: ['Coronary artery CT angiography. Exertional chest pain, inconclusive stress test. Resting heart rate 82 bpm.', 'Angio-TC das artérias coronárias. Dor torácica aos esforços, teste ergométrico inconclusivo. Frequência cardíaca em repouso 82 bpm.'],
    h: ['Dyslipidaemia, ex-smoker. No asthma or heart block: can receive a beta-blocker.', 'Dislipidemia, ex-fumante. Sem asma nem bloqueios cardíacos: pode receber betabloqueador.'],
    q: ['What does the coronary CT angiography show?', 'O que a angio-TC coronária mostra?'],
    op: [['Normal coronary arteries', 'Mixed plaque (calcified and soft) with significant stenosis in the proximal LAD', 'Right coronary artery occlusion', 'Myocardial bridge without stenosis'],
      ['Coronárias normais', 'Placa mista (calcificada e mole) com estenose significativa na DA proximal', 'Oclusão da coronária direita', 'Ponte miocárdica sem estenose']],
    e: ['In the proximal left anterior descending artery there is a calcified plaque followed by a soft plaque that markedly narrows the lumen (significant stenosis). Seeing 3–4 mm coronary arteries requires a low heart rate (beta-blocker if > 65 bpm), ECG gating in diastole (70–80 %), 0.625 mm slices, contrast at 5 mL/s and a single short breath-hold.',
      'Na descendente anterior proximal há uma placa calcificada seguida de uma placa mole que estreita muito a luz (estenose significativa). Para ver coronárias de 3–4 mm é preciso: frequência cardíaca baixa (betabloqueador se > 65 bpm), sincronização com o ECG na diástole (70–80 %), cortes de 0,625 mm, contraste a 5 mL/s e uma única apneia curta.'],
  },
  'ictus-acm': {
    t: ['Stroke code — unenhanced CT, CT angiography of the circle of Willis and perfusion', 'Código AVC — TC sem contraste, angio-TC do polígono de Willis e perfusão'],
    o: ['STROKE CODE. Left hemiplegia, rightward gaze deviation and neglect for 1 h 40 min. NIHSS 16. Request: unenhanced CT, CT angiography of the supra-aortic vessels and circle of Willis, and perfusion.', 'CÓDIGO AVC. Hemiplegia esquerda, desvio do olhar para a direita e negligência há 1 h 40 min. NIHSS 16. Solicito TC sem contraste, angio-TC dos troncos supra-aórticos e polígono de Willis, e perfusão.'],
    h: ['Atrial fibrillation, not anticoagulated. Blood glucose 118 mg/dL.', 'Fibrilação atrial sem anticoagulação. Glicemia 118 mg/dL.'],
    p: ['Not applicable (72 years old)', 'Não se aplica (72 anos)'],
    q: ['What is the diagnosis?', 'Qual é o diagnóstico?'],
    op: [['No large vessel occlusion', 'RIGHT MCA (M1) occlusion with a small core and extensive penumbra: candidate for thrombectomy', 'Right intraparenchymal haemorrhage', 'LEFT MCA occlusion'],
      ['Sem oclusão de grandes vasos', 'Oclusão da ACM DIREITA (M1) com core pequeno e penumbra extensa: candidata a trombectomia', 'Hemorragia intraparenquimatosa direita', 'Oclusão da ACM ESQUERDA']],
    e: ['On unenhanced CT the right MCA looks hyperdense (thrombus). CT angiography shows the cut-off of the right M1 with distal branches filling late through collaterals. On perfusion the core is small (very low CBF and CBV) and the territory with Tmax > 6 s is much larger: there is salvageable tissue (mismatch) and the patient is a thrombectomy candidate.',
      'Na TC sem contraste a ACM direita aparece hiperdensa (trombo). A angio-TC mostra a amputação da M1 direita com ramos distais que se enchem tarde por colaterais. Na perfusão o core é pequeno (CBF e CBV muito baixos) e o território com Tmax > 6 s é muito maior: há tecido salvável (mismatch) e a paciente é candidata a trombectomia.'],
  },
  'pediatrico-tec': {
    t: ['Paediatric head CT — head injury', 'TC de crânio pediátrica — traumatismo'],
    o: ['UNENHANCED head CT. Fall of 1.5 m from a bunk bed, lucid interval followed by drowsiness and two episodes of vomiting. Glasgow 13.', 'TC de crânio SEM contraste. Queda de 1,5 m de um beliche, intervalo lúcido e depois sonolência e dois vômitos. Glasgow 13.'],
    h: ['Arrives with his mother. Left parietal scalp haematoma.', 'Chega com a mãe. Hematoma parietal esquerdo no couro cabeludo.'],
    q: ['What does the study show?', 'O que o estudo mostra?'],
    op: [['Normal study', 'Left EPIDURAL haematoma (biconvex) with a parietal fracture', 'Right subdural haematoma', 'Frontal contusion'], ['Estudo normal', 'Hematoma EPIDURAL esquerdo (biconvexo) com fratura parietal', 'Hematoma subdural direito', 'Contusão frontal']],
    e: ['Biconvex (lentiform) hyperdense collection next to the left parietal bone that does not cross the sutures, with a linear skull fracture (bone window): epidural haematoma, a neurosurgical emergency. In children the dose must be adjusted to size (Image Gently): the adult protocol would give twice the effective dose.',
      'Coleção hiperdensa biconvexa (lentiforme) junto à calota parietal esquerda, que não cruza as suturas, com fratura linear da calota (janela óssea): hematoma epidural, uma urgência neurocirúrgica. Em crianças a dose deve ser ajustada ao tamanho (Image Gently): o protocolo de adulto daria o dobro da dose efetiva.'],
  },
  'tep-embarazada': {
    t: ['CT pulmonary angiography in pregnancy (24 weeks)', 'Angio-TC pulmonar em gestante (24 semanas)'],
    o: ['CT pulmonary angiography. 24 weeks pregnant, dyspnoea and tachycardia; raised D-dimer; negative lower-limb Doppler ultrasound. Study justified by the radiologist.', 'Angio-TC de artérias pulmonares. Gestação de 24 semanas, dispneia e taquicardia; dímero D elevado; doppler de membros inferiores negativo. Estudo justificado pelo radiologista.'],
    h: ['Normal pregnancy. The patient asks whether the radiation affects the baby.', 'Gestação normal. A paciente pergunta se a radiação afeta o bebê.'],
    p: ['24-week pregnancy (confirmed)', 'Gestação de 24 semanas (confirmada)'],
    q: ['What does the study show?', 'O que o estudo mostra?'],
    op: [['Well-opacified pulmonary arteries WITHOUT filling defects (no PE)', 'Bilateral PE', 'Lobar pneumonia', 'Aortic dissection'], ['Artérias pulmonares bem opacificadas, SEM falhas de enchimento (não há TEP)', 'TEP bilateral', 'Pneumonia lobar', 'Dissecção de aorta']],
    e: ['The pulmonary arteries enhance well and there are no filling defects: PE is ruled out. In pregnancy the increased cardiac output dilutes contrast (good flow and bolus tracking are needed). The uterus stays out of the beam if the scout and range are limited to the chest: the fetal dose is scatter only (< 0.1 mGy).',
      'As artérias pulmonares realçam bem e não há falhas de enchimento: descarta-se TEP. Na gestação o débito cardíaco aumentado dilui o contraste (é preciso bom fluxo e bolus tracking). O útero fica fora do feixe se o topograma e o alcance se limitarem ao tórax: a dose fetal é só espalhada (< 0,1 mGy).'],
  },
  'obeso-abdomen': {
    t: ['Contrast-enhanced abdominal CT — patient with obesity', 'TC de abdome com contraste — paciente com obesidade'],
    o: ['Abdomen and pelvis CT WITH contrast. Staging of colon cancer.', 'TC de abdome e pelve COM contraste. Estadiamento de câncer de cólon.'],
    h: ['BMI 47. Weight within the table limit (227 kg).', 'IMC 47. Peso dentro do limite da mesa (227 kg).'],
    q: ['What is seen in the liver?', 'Que achado há no fígado?'],
    op: [['Normal liver', 'Hypodense lesion in the RIGHT hepatic lobe consistent with a metastasis', 'Simple cyst in the left lobe', 'Diffuse steatosis'], ['Fígado normal', 'Lesão hipodensa no lobo hepático DIREITO compatível com metástase', 'Cisto simples no lobo esquerdo', 'Esteatose difusa']],
    e: ['Hypodense ~2 cm lesion in the right lobe in the portal venous phase: metastasis. In obese patients far fewer photons reach the detector: without enough kV/mAs (or modulation) noise hides low-contrast lesions. The DFOV must include all the skin; otherwise anatomy is lost and artefacts appear.',
      'Lesão hipodensa de ~2 cm no lobo direito na fase portal: metástase. Em pacientes obesos chegam muito menos fótons: sem kV/mAs suficientes (ou modulação) o ruído esconde lesões de baixo contraste. O DFOV deve incluir toda a pele; caso contrário perde-se anatomia e surgem artefatos.'],
  },
  'biopsia-pulmon': {
    t: ['CT-guided lung biopsy', 'Biópsia pulmonar guiada por TC'],
    o: ['CT-guided percutaneous biopsy of an 18 mm right upper lobe nodule suspicious for malignancy. INR 1.1; platelets 245,000. Consent signed.', 'Biópsia percutânea guiada por TC de nódulo de 18 mm no lobo superior direito, suspeito de malignidade. INR 1,1; plaquetas 245.000. Consentimento assinado.'],
    h: ['Ex-smoker. Mild COPD. Stopped aspirin 7 days ago.', 'Ex-fumante. DPOC leve. Suspendeu o AAS há 7 dias.'],
    q: ['Is there a pneumothorax on the final check scan?', 'Há pneumotórax no controle final?'],
    op: [['No', 'Yes'], ['Não', 'Sim']],
  },
};

// Eventos del paciente, por su título en español
const EV = {
  'Sensación de calor': {
    t: ['Feeling of warmth', 'Sensação de calor'],
    x: ['When the injection starts the patient says she feels intense warmth all over her body and as if she needs to urinate. She is conscious, breathing normally and has no skin lesions.', 'Ao iniciar a injeção a paciente diz sentir um calor intenso no corpo todo e como se fosse urinar. Está consciente, respira bem e não tem lesões na pele.'],
    op: [['Stop the study and call the emergency doctor', 'Reassure her: it is an expected, transient effect of contrast; continue monitoring her', 'Remove the cannula immediately'], ['Interromper o exame e chamar o médico de emergência', 'Tranquilizá-la: é um efeito esperado e passageiro do contraste; continuar observando', 'Retirar o cateter imediatamente']],
    e: ['Generalised warmth and the urge to urinate are common physiological effects of iodinated contrast (vasodilatation), not an allergy. Reassure the patient, keep monitoring and carry on.', 'O calor generalizado e a sensação de micção são efeitos fisiológicos frequentes do contraste iodado (vasodilatação), não alergia. Tranquiliza-se a paciente, continua-se a observação e prossegue-se.'],
  },
  'Habones tras el contraste': {
    t: ['Hives after contrast', 'Urticária após o contraste'],
    x: ['At the end, the patient has hives on the chest and itching. Breathing normally, no hoarseness or wheezing; normal blood pressure.', 'Ao terminar, o paciente apresenta urticária no tórax e prurido. Respira bem, sem rouquidão nem sibilos; pressão arterial normal.'],
    op: [['Discharge him, it is mild', 'Inform the radiologist, keep the IV line, monitor vital signs and record the reaction', 'Give intramuscular adrenaline immediately'], ['Dar alta, é leve', 'Avisar o radiologista, manter o acesso venoso, monitorar sinais vitais e registrar a reação', 'Administrar adrenalina intramuscular imediatamente']],
    e: ['This is a mild reaction. Inform the radiologist (who may prescribe an antihistamine), keep the IV line, monitor for at least 30 min in case it progresses and record it for future studies. Adrenaline is reserved for moderate-to-severe reactions (bronchospasm, laryngeal oedema, hypotension).', 'É uma reação leve. Avisa-se o radiologista (pode indicar anti-histamínico), mantém-se o acesso venoso, observa-se pelo menos 30 min caso progrida e registra-se no prontuário para futuros exames. A adrenalina fica reservada para reações moderadas-graves (broncoespasmo, edema de laringe, hipotensão).'],
  },
  'Náuseas': {
    t: ['Nausea', 'Náuseas'],
    x: ['During the injection the patient reports intense nausea.', 'Durante a injeção a paciente refere náuseas intensas.'],
    op: [['Pause, reassure her, turn her on her side if she vomits to prevent aspiration, and continue when it settles', 'Ignore it and keep scanning', 'Stop the study and discharge her'], ['Pausar, tranquilizá-la, virá-la de lado se vomitar para evitar aspiração e continuar quando passar', 'Ignorar e continuar o exame', 'Suspender o exame e dar alta']],
    e: ['Nausea is common and usually settles within seconds. The risk is aspiration if she vomits lying supine: stay alert, turn her on her side if needed and continue when she is stable.', 'As náuseas são frequentes e costumam passar em segundos. O risco é a aspiração se vomitar em decúbito: é preciso atenção, virá-la de lado se necessário e continuar quando estiver estável.'],
  },
  'Paciente ansioso': {
    t: ['Anxious patient', 'Paciente ansioso'],
    x: ['The patient is very nervous, breathing fast and moving on the table.', 'O paciente está muito nervoso, respira rápido e se mexe na mesa.'],
    op: [['Explain the procedure, practise the breath-hold with him and wait until he calms down before starting', 'Start straight away to finish sooner', 'Strap him down without explaining anything'], ['Explicar o procedimento, treinar a apneia com ele e esperar que se acalme antes de começar', 'Começar logo para terminar o quanto antes', 'Prendê-lo com faixas sem explicar nada']],
    e: ['An anxious patient moves and cannot hold their breath: artefacts and a high heart rate. Explaining, rehearsing the breath-hold and allowing time improve image quality and the patient’s experience.', 'Um paciente ansioso se mexe e não mantém a apneia: artefatos e frequência cardíaca alta. Explicar, ensaiar a apneia e dar tempo melhoram a qualidade e a experiência.'],
  },
  'Niño que llora': {
    t: ['Crying child', 'Criança chorando'],
    x: ['The child is crying, will not keep still and is calling for his mother.', 'A criança chora, não fica quieta e chama a mãe.'],
    op: [['Let the mother (wearing a lead apron) stay and comfort him; use a paediatric head support and immobiliser; sedation only if the doctor prescribes it', 'Scan anyway: the study is quick', 'Ask for sedation without a medical assessment'], ['Deixar a mãe (com avental de chumbo) acompanhá-lo e acalmá-lo; usar suporte e imobilizador pediátrico; sedação só se o médico indicar', 'Fazer o exame assim mesmo: é rápido', 'Pedir sedação sem avaliação médica']],
    e: ['In children, try first without sedation: a protected companion, an age-appropriate explanation, immobilisers and a fast acquisition. If the child cannot cooperate, sedation is decided and monitored by the doctor.', 'Em crianças tenta-se primeiro sem sedação: acompanhante protegido, explicação adaptada, imobilizadores e aquisição rápida. Se não colaborar, a sedação é decidida e monitorada pelo médico.'],
  },
};

const METAL = {
  aretes: ['Earrings', 'Brincos'], collar: ['Necklace / chain', 'Colar / corrente'], gafas: ['Glasses', 'Óculos'], protesisDental: ['Removable denture', 'Prótese dentária removível'],
  horquillas: ['Hairpins', 'Grampos de cabelo'], brasier: ['Underwired bra', 'Sutiã com aro metálico'], cinturon: ['Belt with buckle', 'Cinto com fivela'],
  monedas: ['Coins / keys in the pocket', 'Moedas / chaves no bolso'], piercing: ['Navel piercing', 'Piercing umbilical'], reloj: ['Watch', 'Relógio'],
};

// Casos de artefactos: [título, descripción breve, explicación] × [inglés, portugués]
const ART = {
  'art-movimiento': [['Artefact: abdomen with double contours', 'Artefato: abdome com contornos duplos'], ['The abdominal series shows double contours and streaks arising from air/tissue interfaces.', 'A série de abdome mostra contornos duplos e faixas que saem das interfaces ar/tecido.'], ['If the patient breathes during the rotation, the projections are inconsistent: double contours, streaks at air/tissue interfaces and, between slices, shifts that look like steps on MPRs. It is corrected with breathing instructions (breathe in and hold) and an acquisition shorter than the breath-hold the patient can manage (higher pitch, faster rotation or wider collimation).', 'Se o paciente respira durante a rotação, as projeções ficam incoerentes: contornos duplos, faixas nas interfaces ar/tecido e, entre cortes, deslocamentos que parecem degraus nas MPR. Corrige-se com instruções respiratórias (inspire e não respire) e uma aquisição mais curta que a apneia que o paciente tolera (pitch maior, rotação mais rápida ou colimação mais larga).']],
  'art-metal': [['Artefact: streaks in the pelvis', 'Artefato: faixas na pelve'], ['The pelvis shows bright and dark streaks radiating from the right hip.', 'A pelve mostra faixas brilhantes e escuras que irradiam do quadril direito.'], ['The prosthesis metal absorbs almost all photons (photon starvation) and hardens the beam: the projections through it are wrong and backprojection turns them into dark and bright streaks. They are reduced with metal artefact reduction (MAR), higher kV and adequate mAs. Removing external metal avoids the problem altogether.', 'O metal da prótese absorve quase todos os fótons (falta de fótons) e endurece o feixe: as projeções que o atravessam ficam erradas e a retroprojeção as transforma em faixas escuras e brilhantes. Reduz-se com algoritmos de redução de metal (MAR), kV mais alto e mAs suficientes. Retirar o metal externo evita o problema.']],
  'art-brazos': [['Artefact: horizontal streaks in the chest', 'Artefato: faixas horizontais no tórax'], ['The chest shows horizontal streaks and more noise laterally.', 'O tórax mostra faixas horizontais e mais ruído nas laterais.'], ['With the arms by the sides, lateral rays cross much more tissue and the humeri: few photons arrive (noise) and the beam hardens (horizontal streaks between the arms). For chest and abdomen the arms go above the head. Tube current modulation compensates only partly.', 'Com os braços ao lado do corpo, os raios laterais atravessam muito mais tecido e os úmeros: chegam poucos fótons (ruído) e o feixe endurece (faixas horizontais entre os braços). Em tórax e abdome os braços ficam acima da cabeça. A modulação de corrente compensa só em parte.']],
  'art-truncamiento': [['Artefact: bright rim in the abdomen', 'Artefato: borda brilhante no abdome'], ['The abdominal image has a very bright rim on both sides and the lateral anatomy is missing.', 'A imagem do abdome tem uma borda muito brilhante dos dois lados e a anatomia lateral não aparece.'], ['The head scan field of view (SFOV) covers only 300 mm: the part of the abdomen outside it attenuates the rays but is not measured, and reconstruction places that attenuation at the edge of the field (bright rim). Use the body SFOV (500 mm) and a DFOV that includes all the skin. With very large patients good centring also helps.', 'O campo de medida (SFOV) de cabeça cobre só 300 mm: a parte do abdome que fica fora atenua os raios mas não é medida, e a reconstrução coloca essa atenuação na borda do campo (borda brilhante). Use o SFOV de corpo (500 mm) e um DFOV que inclua toda a pele. Em pacientes muito grandes também ajuda centralizá-los bem.']],
  'art-escalera': [['Artefact: stepped coronal reformat', 'Artefato: reconstrução coronal em degraus'], ['On coronal and sagittal reformats the outlines of the diaphragm and ribs look stepped.', 'Nas reconstruções coronal e sagital os contornos do diafragma e das costelas aparecem em degraus.'], ['Multiplanar reformats are built by stacking the axial slices: with 5 mm, each step is 5 mm along z. Since the helical acquisition already has fine-collimation raw data, it is enough to reconstruct thin (≤ 1.25 mm) overlapping slices without irradiating the patient again.', 'As reconstruções multiplanares são feitas empilhando os cortes axiais: com 5 mm, cada degrau mede 5 mm no eixo z. Como a aquisição helicoidal já tem os dados brutos com colimação fina, basta reconstruir cortes finos (≤ 1,25 mm) e sobrepostos sem irradiar o paciente de novo.']],
  'art-ruido': [['Artefact: grainy image in an obese patient', 'Artefato: imagem granulada em paciente obeso'], ['The abdomen of a 132 kg patient looks very grainy with fine streaks.', 'O abdome de um paciente de 132 kg aparece muito granulado e com faixas finas.'], ['Noise depends on the number of photons reaching the detector, and in a large patient very few arrive. Increase the mAs (or enable tube current modulation, which does it according to size), consider higher kV and slightly thicker slices or iterative reconstruction. In exchange the dose rises: it must be justified.', 'O ruído depende do número de fótons que chegam ao detector, e num paciente grande chegam muito poucos. É preciso subir os mAs (ou ativar a modulação de corrente, que o faz conforme o tamanho), considerar mais kV e cortes um pouco mais grossos ou reconstrução iterativa. Em troca a dose aumenta: deve ser justificada.']],
  'art-anillos': [['Artefact: concentric circles in the head', 'Artefato: círculos concêntricos no crânio'], ['The head CT shows several thin circles centred on the isocentre, visible on every slice.', 'A TC de crânio mostra vários círculos finos centrados no isocentro, visíveis em todos os cortes.'], ['Each detector channel always sits at the same distance from the isocentre: if a channel has a different gain (defect, thermal drift or missing calibration), its error is backprojected as a circle centred on the isocentre. Reconstructing again does not help, because the error is in the raw data. It is corrected with the detector air calibration (daily quality control) and a repeat scan; if it persists, the channel is faulty and service must be called.', 'Cada canal do detector fica sempre à mesma distância do isocentro: se um canal tem ganho diferente (defeito, deriva térmica ou falta de calibração), seu erro é retroprojetado como um círculo centrado no isocentro. Reconstruir de novo não adianta, porque o erro está nos dados brutos. Corrige-se com a calibração do detector no ar (controle de qualidade diário) e repetindo; se persistir, o canal está avariado e é preciso chamar a assistência técnica.']],
};
const ART_TYPES = {
  motion: ['Patient motion (breathing)', 'Movimento do paciente (respiração)'], metal: ['Metal: beam hardening and photon starvation', 'Metal: endurecimento do feixe e falta de fótons'],
  arms: ['Arms in the field (streaks and noise)', 'Braços dentro do campo (faixas e ruído)'], truncation: ['Truncation: the patient extends beyond the scan field of view (SFOV)', 'Truncamento: o paciente sai do campo de medida (SFOV)'],
  stair: ['Stair-step on MPR reformats (thick slices)', 'Escada nas reconstruções MPR (cortes grossos)'], noise: ['Excessive quantum noise (too few photons for the patient size)', 'Ruído quântico excessivo (poucos fótons para o tamanho do paciente)'],
  rings: ['Rings: faulty or uncalibrated detector channel', 'Anéis: canal do detector defeituoso ou sem calibração'],
};

const COMMON = [
  ['Serie con artefacto', 'Series with an artefact', 'Série com artefato'], ['¿Qué artefacto tiene la serie «Original»?', 'Which artefact does the “Original” series have?', 'Que artefato tem a série «Original»?'],
  ['Revise las imágenes (también en coronal y sagital).', 'Review the images (also coronal and sagittal).', 'Revise as imagens (também em coronal e sagital).'],
  ['Corrija la causa: sala, protocolo o reconstrucción desde los datos brutos.', 'Correct the cause: room, protocol or reconstruction from raw data.', 'Corrija a causa: sala, protocolo ou reconstrução a partir dos dados brutos.'],
  ['Repita la adquisición solo si hace falta.', 'Repeat the acquisition only if needed.', 'Repita a aquisição só se necessário.'],
  ['En «Finalizar», identifique el artefacto.', 'In “Finish”, identify the artefact.', 'Em «Finalizar», identifique o artefato.'],
  ['Empezar', 'Start', 'Começar'], ['Repetición', 'Repeat', 'Repetição'],
  ['Ninguna conocida', 'None known', 'Nenhuma conhecida'],
  ['No aplica', 'Not applicable', 'Não se aplica'],
];

export function caseTranslationRows() {
  const rows = [...COMMON];
  const add = (es, pair) => { if (es && pair) rows.push([es, pair[0], pair[1]]); };
  for (const c of CASES) {
    const t = TR[c.key];
    if (!t) continue;
    add(c.title, t.t); add(c.order, t.o); add(c.history, t.h); add(c.patient.allergies, t.a); add(c.patient.pregnancy, t.p);
    add(c.question.text, t.q); add(c.question.explanation, t.e);
    if (t.op) c.question.options.forEach((o, i) => add(o, [t.op[0][i], t.op[1][i]]));
    const ev = c.event && EV[c.event.title];
    if (ev) {
      add(c.event.title, ev.t); add(c.event.text, ev.x); add(c.event.explanation, ev.e);
      c.event.options.forEach((o, i) => add(o, [ev.op[0][i], ev.op[1][i]]));
    }
  }
  for (const [k, es] of Object.entries(METAL_ITEMS)) add(es, METAL[k]);
  for (const a of ARTIFACT_CASES) { const t = ART[a.key]; if (t) { add(a.title, t[0]); add(a.brief, t[1]); add(a.explanation, t[2]); } }
  for (const [k, es] of Object.entries(ARTIFACT_TYPES)) add(es, ART_TYPES[k]);
  return rows;
}

addTranslations(caseTranslationRows());
