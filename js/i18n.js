// Traducción de la interfaz (español → inglés / portugués).
// Recorre los textos visibles (y los que la app genera después, con un MutationObserver) y sustituye
// las cadenas conocidas. Los textos clínicos de los casos se mantienen en el idioma en que se escribieron.

export const LANGS = { es: 'Español', en: 'English', pt: 'Português' };
const KEY = 'opentc-lang';

// [español, inglés, portugués]
const T = [
  // Barra superior y navegación
  ['simulador educativo de TC', 'educational CT simulator', 'simulador educacional de TC'],
  ['Tutorial', 'Tutorial', 'Tutorial'], ['Nuevo caso', 'New case', 'Novo caso'], ['Panel docente', 'Teacher panel', 'Painel do professor'],
  ['Editor de casos', 'Case editor', 'Editor de casos'], ['Volver al simulador', 'Back to the simulator', 'Voltar ao simulador'],
  ['Elija un caso para empezar', 'Choose a case to start', 'Escolha um caso para começar'],
  ['PRÁCTICA', 'PRACTICE', 'PRÁTICA'], ['EVALUACIÓN', 'ASSESSMENT', 'AVALIAÇÃO'],
  ['Paciente', 'Patient', 'Paciente'], ['Sala y posición', 'Room & positioning', 'Sala e posicionamento'], ['Topograma y rango', 'Scout & range', 'Topograma e alcance'],
  ['Protocolo', 'Protocol', 'Protocolo'], ['Contraste', 'Contrast', 'Contraste'], ['Adquisición', 'Acquisition', 'Aquisição'], ['Visor', 'Viewer', 'Visualizador'], ['Finalizar', 'Finish', 'Finalizar'],
  // Paciente
  ['Orden médica', 'Medical order', 'Pedido médico'], ['Identificación', 'Identification', 'Identificação'],
  ['Pida al paciente que diga su nombre completo y su fecha de nacimiento y compárelos con el brazalete y la orden.', 'Ask the patient to state their full name and date of birth and compare them with the wristband and the order.', 'Peça ao paciente o nome completo e a data de nascimento e compare com a pulseira e o pedido.'],
  ['Preguntar al paciente', 'Ask the patient', 'Perguntar ao paciente'], ['Los datos coinciden con el brazalete y la orden', 'The data match the wristband and the order', 'Os dados coincidem com a pulseira e o pedido'],
  ['Valoración previa', 'Pre-scan assessment', 'Avaliação prévia'], ['Revisar historia clínica y laboratorios', 'Review history and labs', 'Revisar prontuário e exames'],
  ['Confirmé la prueba de embarazo', 'I confirmed the pregnancy test', 'Confirmei o teste de gravidez'], ['Contraste yodado', 'Iodinated contrast', 'Contraste iodado'],
  ['Apto para contraste', 'Cleared for contrast', 'Apto para contraste'], ['No requiere contraste', 'No contrast needed', 'Não requer contraste'], ['Suspender y consultar al radiólogo', 'Withhold and consult the radiologist', 'Suspender e consultar o radiologista'],
  ['Consentimiento informado firmado', 'Signed informed consent', 'Consentimento informado assinado'], ['Acceso venoso', 'IV access', 'Acesso venoso'],
  ['Sin acceso venoso', 'No IV access', 'Sem acesso venoso'], ['22G (azul)', '22G (blue)', '22G (azul)'], ['20G (rosa)', '20G (pink)', '20G (rosa)'], ['18G (verde)', '18G (green)', '18G (verde)'],
  ['Objetos metálicos (pida que los retire)', 'Metal objects (ask the patient to remove them)', 'Objetos metálicos (peça para retirar)'], ['Acompañante', 'Companion', 'Acompanhante'],
  ['Se queda en la sala', 'Stays in the room', 'Fica na sala'], ['Se queda con delantal plomado', 'Stays with a lead apron', 'Fica com avental de chumbo'], ['Sale de la sala', 'Leaves the room', 'Sai da sala'],
  ['Administrar betabloqueador (metoprolol)', 'Give a beta-blocker (metoprolol)', 'Administrar betabloqueador (metoprolol)'],
  // Sala
  ['Posicionamiento', 'Positioning', 'Posicionamento'], ['Orientación', 'Orientation', 'Orientação'], ['Cabeza primero', 'Head first', 'Cabeça primeiro'], ['Pies primero', 'Feet first', 'Pés primeiro'],
  ['Brazos', 'Arms', 'Braços'], ['A los lados', 'By the sides', 'Ao lado do corpo'], ['Sobre la cabeza', 'Above the head', 'Acima da cabeça'],
  ['Soporte de cabeza', 'Head holder', 'Suporte de cabeça'], ['Cinta de sujeción', 'Restraint strap', 'Fita de contenção'],
  ['Instrucciones respiratorias automáticas («inspire y no respire»)', 'Automatic breathing instructions ("breathe in and hold")', 'Instruções respiratórias automáticas («inspire e prenda a respiração»)'],
  ['Protectores de bismuto', 'Bismuth shields', 'Protetores de bismuto'], ['Ojos', 'Eyes', 'Olhos'], ['Tiroides', 'Thyroid', 'Tireoide'], ['Mamas', 'Breasts', 'Mamas'],
  ['Centrado', 'Centering', 'Centralização'], ['Encender láseres', 'Turn on lasers', 'Ligar lasers'], ['Altura mesa', 'Table height', 'Altura da mesa'],
  ['Láseres apagados', 'Lasers off', 'Lasers desligados'], ['Láser coronal en la línea medioaxilar', 'Coronal laser on the mid-axillary line', 'Laser coronal na linha axilar média'],
  ['Punto de referencia…', 'Landmark…', 'Ponto de referência…'], ['Marcar cero', 'Set zero', 'Marcar zero'], ['Sin cero marcado.', 'No zero set.', 'Sem zero marcado.'],
  ['Llevar al isocentro', 'Move to isocenter', 'Levar ao isocentro'], ['Vértex', 'Vertex', 'Vértice'], ['Nasion (línea orbitomeatal)', 'Nasion (orbitomeatal line)', 'Násio (linha orbitomeatal)'],
  ['Mentón', 'Chin', 'Mento'], ['Escotadura esternal', 'Sternal notch', 'Fúrcula esternal'], ['Apéndice xifoides', 'Xiphoid process', 'Apêndice xifoide'], ['Crestas ilíacas', 'Iliac crests', 'Cristas ilíacas'], ['Sínfisis del pubis', 'Pubic symphysis', 'Sínfise púbica'],
  ['Arrastre para girar · rueda para acercar · con gafas de RV use «ENTER VR»', 'Drag to rotate · scroll to zoom · with a VR headset use "ENTER VR"', 'Arraste para girar · roda para aproximar · com óculos de RV use «ENTER VR»'],
  // Topograma
  ['Topograma', 'Scout', 'Topograma'], ['Vista', 'View', 'Vista'], ['Lateral', 'Lateral', 'Lateral'], ['Inicio (mm)', 'Start (mm)', 'Início (mm)'], ['Longitud (mm)', 'Length (mm)', 'Comprimento (mm)'],
  ['Inicio relativo al cero marcado con el láser (negativo = hacia la cabeza).', 'Start relative to the laser zero (negative = towards the head).', 'Início relativo ao zero do laser (negativo = em direção à cabeça).'],
  ['Adquirir topograma', 'Acquire scout', 'Adquirir topograma'], ['Planificación', 'Planning', 'Planejamento'], ['Inicio rango', 'Range start', 'Início do alcance'], ['Fin rango', 'Range end', 'Fim do alcance'], ['Longitud', 'Length', 'Comprimento'],
  ['Arrastre las líneas amarillas sobre el topograma (o el bloque completo). Las posiciones están en mm de mesa desde el cero.', 'Drag the yellow lines on the scout (or the whole block). Positions are table mm from zero.', 'Arraste as linhas amarelas no topograma (ou o bloco inteiro). As posições estão em mm de mesa a partir do zero.'],
  ['Adquiera un topograma', 'Acquire a scout', 'Adquira um topograma'],
  // Protocolo
  ['Elija un protocolo…', 'Choose a protocol…', 'Escolha um protocolo…'], ['Cargar', 'Load', 'Carregar'], ['Series', 'Series', 'Séries'], ['+ Añadir serie', '+ Add series', '+ Adicionar série'], ['Cargue un protocolo.', 'Load a protocol.', 'Carregue um protocolo.'],
  ['mAs ef. (ref.)', 'Eff. mAs (ref.)', 'mAs ef. (ref.)'], ['Modulación (ATCM)', 'Dose modulation (ATCM)', 'Modulação (ATCM)'], ['Rotación (s)', 'Rotation (s)', 'Rotação (s)'], ['Colimación', 'Collimation', 'Colimação'],
  ['Grosor (mm)', 'Thickness (mm)', 'Espessura (mm)'], ['Filtro', 'Kernel', 'Filtro'], ['Sincronización ECG', 'ECG gating', 'Sincronização ECG'], ['Fase cardíaca (%)', 'Cardiac phase (%)', 'Fase cardíaca (%)'],
  ['Inclinación gantry (°)', 'Gantry tilt (°)', 'Inclinação do gantry (°)'], ['Doble energía 80/140 kV', 'Dual energy 80/140 kV', 'Dupla energia 80/140 kV'], ['Iterativa (%)', 'Iterative (%)', 'Iterativa (%)'], ['Reducción de metal', 'Metal artifact reduction', 'Redução de metal'],
  ['Sí', 'Yes', 'Sim'], ['No', 'No', 'Não'], ['Sin ECG', 'No ECG', 'Sem ECG'], ['Prospectiva', 'Prospective', 'Prospectiva'], ['Retrospectiva', 'Retrospective', 'Retrospectiva'],
  ['Cabeza (300 mm)', 'Head (300 mm)', 'Cabeça (300 mm)'], ['Cuerpo (500 mm)', 'Body (500 mm)', 'Corpo (500 mm)'],
  ['Dosis efectiva', 'Effective dose', 'Dose efetiva'], ['Tiempo', 'Time', 'Tempo'], ['Corriente', 'Tube current', 'Corrente'], ['mAs medio', 'Mean mAs', 'mAs médio'], ['Velocidad mesa', 'Table speed', 'Velocidade da mesa'],
  ['Ruido esperado', 'Expected noise', 'Ruído esperado'], ['Cortes', 'Slices', 'Cortes'],
  ['Simple', 'Non-contrast', 'Sem contraste'], ['Arterial', 'Arterial', 'Arterial'], ['Portal', 'Portal venous', 'Portal'], ['Tardía / excretora', 'Delayed / excretory', 'Tardia / excretora'], ['Perfusión', 'Perfusion', 'Perfusão'],
  ['Sin contraste', 'No contrast', 'Sem contraste'], ['Retardo fijo', 'Fixed delay', 'Atraso fixo'], ['Seguimiento del bolo', 'Bolus tracking', 'Rastreamento do bolo'],
  // Contraste
  ['Inyector', 'Injector', 'Injetora'], ['Volumen (mL)', 'Volume (mL)', 'Volume (mL)'], ['Caudal (mL/s)', 'Flow rate (mL/s)', 'Fluxo (mL/s)'], ['Concentración (mgI/mL)', 'Concentration (mgI/mL)', 'Concentração (mgI/mL)'], ['Suero (mL)', 'Saline (mL)', 'Soro (mL)'],
  ['Duración', 'Duration', 'Duração'], ['Yodo total', 'Total iodine', 'Iodo total'], ['Aporte de yodo', 'Iodine delivery rate', 'Aporte de iodo'],
  ['Curvas de realce previstas', 'Predicted enhancement curves', 'Curvas de realce previstas'], ['previsión orientativa', 'approximate prediction', 'previsão aproximada'], ['oculta en modo evaluación', 'hidden in assessment mode', 'oculta no modo avaliação'],
  ['Art. pulmonar', 'Pulm. artery', 'Art. pulmonar'], ['Aorta', 'Aorta', 'Aorta'], ['Porta', 'Portal vein', 'Veia porta'], ['Hígado', 'Liver', 'Fígado'], ['Nódulo', 'Nodule', 'Nódulo'],
  // Adquisición
  ['Antes de empezar', 'Before you start', 'Antes de começar'], ['Iniciar adquisición', 'Start acquisition', 'Iniciar aquisição'], ['Listo', 'Ready', 'Pronto'],
  ['Solo para series con seguimiento del bolo', 'Only for bolus-tracking series', 'Somente para séries com rastreamento do bolo'],
  ['Identidad verificada', 'Identity verified', 'Identidade verificada'], ['Decisión sobre el contraste registrada', 'Contrast decision recorded', 'Decisão sobre o contraste registrada'], ['Paciente en el isocentro', 'Patient at isocenter', 'Paciente no isocentro'],
  ['Topograma adquirido', 'Scout acquired', 'Topograma adquirido'], ['Rango planificado', 'Range planned', 'Alcance planejado'], ['Protocolo cargado', 'Protocol loaded', 'Protocolo carregado'], ['Instrucciones respiratorias activadas', 'Breathing instructions on', 'Instruções respiratórias ativadas'],
  ['Haga clic en el centro del vaso de referencia para colocar la ROI.', 'Click the center of the reference vessel to place the ROI.', 'Clique no centro do vaso de referência para colocar a ROI.'],
  // Visor
  ['Axial', 'Axial', 'Axial'], ['Coronal', 'Coronal', 'Coronal'], ['Sagital', 'Sagittal', 'Sagital'], ['Cerebro', 'Brain', 'Cérebro'], ['Subdural', 'Subdural', 'Subdural'], ['Partes blandas', 'Soft tissue', 'Partes moles'],
  ['Angio', 'Angio', 'Angio'], ['Pulmón', 'Lung', 'Pulmão'], ['Hueso', 'Bone', 'Osso'], ['Ventana', 'Window', 'Janela'], ['ROI', 'ROI', 'ROI'], ['Distancia', 'Distance', 'Distância'],
  ['Sin MIP', 'No MIP', 'Sem MIP'], ['Exportar DICOM', 'Export DICOM', 'Exportar DICOM'], ['Sin imágenes', 'No images', 'Sem imagens'], ['Corte', 'Slice', 'Corte'],
  ['Rueda: cortes · Ctrl+rueda: zoom · arrastrar: ventana/nivel · doble clic: restablecer', 'Wheel: slices · Ctrl+wheel: zoom · drag: window/level · double-click: reset', 'Roda: cortes · Ctrl+roda: zoom · arrastar: janela/nível · duplo clique: restaurar'],
  ['Reconstruir desde los datos brutos', 'Reconstruct from raw data', 'Reconstruir a partir dos dados brutos'], ['(sin irradiar de nuevo)', '(no extra radiation)', '(sem irradiar de novo)'], ['Grosor', 'Thickness', 'Espessura'],
  ['Iterativa', 'Iterative', 'Iterativa'], ['Reconstruir', 'Reconstruct', 'Reconstruir'], ['Doble energía', 'Dual energy', 'Dupla energia'], ['Generar', 'Generate', 'Gerar'], ['Fase ECG', 'ECG phase', 'Fase ECG'],
  ['Listo: sin dosis adicional.', 'Done: no additional dose.', 'Pronto: sem dose adicional.'],
  // Fase B: visor avanzado, calcio, aleatorios y biopsia
  ['Oblicua', 'Oblique', 'Oblíqua'], ['Curva', 'Curved', 'Curva'], ['3D MIP', '3D MIP', '3D MIP'], ['3D VR', '3D VR', '3D VR'], ['Plano oblicuo', 'Oblique plane', 'Plano oblíquo'],
  ['Trayecto', 'Path', 'Trajeto'], ['✕ trayecto', '✕ path', '✕ trajeto'], ['Calcio (Agatston)', 'Calcium (Agatston)', 'Cálcio (Agatston)'],
  ['Casos aleatorios', 'Random cases', 'Casos aleatórios'], ['Procedimientos', 'Procedures', 'Procedimentos'],
  ['Biopsia pulmonar guiada por TC', 'CT-guided lung biopsy', 'Biópsia pulmonar guiada por TC'], ['Biopsia guiada por TC', 'CT-guided biopsy', 'Biópsia guiada por TC'],
  ['1. Marcar entrada en la piel', '1. Mark skin entry', '1. Marcar entrada na pele'], ['2. Marcar objetivo', '2. Mark target', '2. Marcar alvo'], ['3. Avanzar aguja', '3. Advance needle', '3. Avançar agulha'],
  ['Corte de control', 'Control scan', 'Corte de controle'], ['Corregir dirección', 'Correct direction', 'Corrigir direção'], ['4. Tomar la muestra', '4. Take the sample', '4. Coletar a amostra'], ['Avance', 'Step', 'Avanço'],
  ['Paleta arcoíris', 'Rainbow palette', 'Paleta arco-íris'], ['Paleta viridis (daltonismo)', 'Viridis palette (color-blind)', 'Paleta viridis (daltonismo)'], ['Saltar al contenido', 'Skip to content', 'Pular para o conteúdo'],
  // Finalizar
  ['Lectura de las imágenes', 'Image reading', 'Leitura das imagens'], ['Despacho del paciente', 'Patient discharge', 'Liberação do paciente'],
  ['Enviar las imágenes al PACS y verificar la llegada', 'Send the images to PACS and check they arrived', 'Enviar as imagens ao PACS e verificar a chegada'],
  ['Indicar hidratación oral (si recibió contraste)', 'Advise oral hydration (if contrast was given)', 'Orientar hidratação oral (se recebeu contraste)'],
  ['Vigilar 30 min y retirar el catéter después (si recibió contraste)', 'Observe for 30 min and then remove the catheter (if contrast was given)', 'Observar 30 min e depois retirar o cateter (se recebeu contraste)'],
  ['Dosis del estudio', 'Exam dose', 'Dose do exame'], ['Finalizar y ver informe', 'Finish and see report', 'Finalizar e ver relatório'], ['Evento', 'Event', 'Evento'], ['Total', 'Total', 'Total'],
  // Guía (lista de comprobación de cada paso)
  ['Verifique dos identificadores (nombre y fecha de nacimiento).', 'Check two identifiers (name and date of birth).', 'Verifique dois identificadores (nome e data de nascimento).'],
  ['Revise función renal, alergias, metformina y embarazo.', 'Review renal function, allergies, metformin and pregnancy.', 'Revise função renal, alergias, metformina e gravidez.'],
  ['Registre la decisión sobre el contraste.', 'Record the contrast decision.', 'Registre a decisão sobre o contraste.'],
  ['Retire los objetos metálicos de la zona a explorar.', 'Remove metal objects from the scan area.', 'Retire os objetos metálicos da área a examinar.'],
  ['Decida dónde queda el acompañante.', 'Decide where the companion stays.', 'Decida onde fica o acompanhante.'],
  ['Paciente en decúbito supino, cabeza primero.', 'Patient supine, head first.', 'Paciente em decúbito dorsal, cabeça primeiro.'],
  ['Brazos fuera del campo.', 'Arms out of the field.', 'Braços fora do campo.'],
  ['Centre la altura de la mesa con el láser coronal en la línea medioaxilar.', 'Center the table height with the coronal laser on the mid-axillary line.', 'Centralize a altura da mesa com o laser coronal na linha axilar média.'],
  ['Marque el cero en el punto de referencia anatómico.', 'Set zero at the anatomical landmark.', 'Marque o zero no ponto de referência anatômico.'],
  ['Lleve al paciente al isocentro.', 'Move the patient to the isocenter.', 'Leve o paciente ao isocentro.'],
  ['Adquiera el topograma.', 'Acquire the scout.', 'Adquira o topograma.'], ['Planifique el rango sobre el topograma.', 'Plan the range on the scout.', 'Planeje o alcance no topograma.'],
  ['Cargue un protocolo y ajústelo.', 'Load a protocol and adjust it.', 'Carregue um protocolo e ajuste-o.'],
  ['Responda la pregunta sobre las imágenes.', 'Answer the question about the images.', 'Responda à pergunta sobre as imagens.'], ['Envíe las imágenes al PACS.', 'Send the images to PACS.', 'Envie as imagens ao PACS.'],
  ['Rueda: cortes. Arrastrar: ventana/nivel. Herramienta ROI: media y DE en HU.', 'Wheel: slices. Drag: window/level. ROI tool: mean and SD in HU.', 'Roda: cortes. Arrastar: janela/nível. Ferramenta ROI: média e DP em HU.'],
  // Columna derecha
  ['Guía', 'Guide', 'Guia'], ['Dosis acumulada', 'Cumulative dose', 'Dose acumulada'], ['DLP total', 'Total DLP', 'DLP total'], ['Registro', 'Log', 'Registro'],
  ['práctica: con pistas', 'practice: with hints', 'prática: com dicas'], ['evaluación: sin pistas', 'assessment: no hints', 'avaliação: sem dicas'],
  // Diálogo inicial
  ['Simulador libre de tomografía computarizada para estudiantes de radiología e imágenes diagnósticas. Pacientes y anatomía ficticios. No apto para uso clínico.', 'Free computed tomography simulator for radiography students. Fictitious patients and anatomy. Not for clinical use.', 'Simulador livre de tomografia computadorizada para estudantes de radiologia. Pacientes e anatomia fictícios. Não é para uso clínico.'],
  ['Nombre', 'Name', 'Nome'], ['Su nombre', 'Your name', 'Seu nome'], ['Modo', 'Mode', 'Modo'], ['Práctica guiada (con pistas)', 'Guided practice (with hints)', 'Prática guiada (com dicas)'], ['Evaluación (sin pistas, con nota)', 'Assessment (no hints, graded)', 'Avaliação (sem dicas, com nota)'],
  ['▶ Tutorial guiado (primera vez)', '▶ Guided tutorial (first time)', '▶ Tutorial guiado (primeira vez)'], ['Un TC de cráneo paso a paso, con explicaciones.', 'A step-by-step head CT with explanations.', 'Uma TC de crânio passo a passo, com explicações.'],
  ['Casos clínicos', 'Clinical cases', 'Casos clínicos'], ['Importar casos del docente (JSON)', 'Import teacher cases (JSON)', 'Importar casos do professor (JSON)'], ['Casos de artefactos', 'Artifact cases', 'Casos de artefatos'],
  ['(el paciente ya está escaneado: identifique, corrija y repita)', '(the patient is already scanned: identify, fix and repeat)', '(o paciente já foi escaneado: identifique, corrija e repita)'],
  ['Código de clase', 'Class code', 'Código da turma'], ['Opcional (servidor de clase)', 'Optional (class server)', 'Opcional (servidor da turma)'], ['Historial en este navegador', 'History in this browser', 'Histórico neste navegador'],
  ['Sin intentos todavía.', 'No attempts yet.', 'Nenhuma tentativa ainda.'], ['Empezar', 'Start', 'Começar'], ['Ver', 'View', 'Ver'], ['caso del docente', 'teacher case', 'caso do professor'],
  // Informe
  ['Informe de evaluación', 'Assessment report', 'Relatório de avaliação'], ['Descargar JSON', 'Download JSON', 'Baixar JSON'], ['Descargar CSV', 'Download CSV', 'Baixar CSV'], ['Imprimir', 'Print', 'Imprimir'], ['Cerrar', 'Close', 'Fechar'],
  ['Criterio', 'Criterion', 'Critério'], ['Puntos', 'Points', 'Pontos'], ['Comentario', 'Comment', 'Comentário'], ['Series y dosis', 'Series and dose', 'Séries e dose'], ['Serie', 'Series', 'Série'], ['Técnica', 'Technique', 'Técnica'], ['Dosis', 'Dose', 'Dose'],
  ['Identificación del paciente', 'Patient identification', 'Identificação do paciente'], ['Valoración previa y decisión sobre el contraste', 'Assessment and contrast decision', 'Avaliação e decisão sobre o contraste'],
  ['Acceso venoso, caudal y bolo de suero', 'IV access, flow and saline chaser', 'Acesso venoso, fluxo e bolus de soro'], ['Retiro de objetos metálicos', 'Removal of metal objects', 'Retirada de objetos metálicos'],
  ['Centrado en el isocentro', 'Isocenter centering', 'Centralização no isocentro'], ['Cobertura anatómica', 'Anatomical coverage', 'Cobertura anatômica'], ['Parámetros de reconstrucción', 'Reconstruction parameters', 'Parâmetros de reconstrução'],
  ['Dosis de radiación', 'Radiation dose', 'Dose de radiação'], ['Sincronización del contraste', 'Contrast timing', 'Sincronização do contraste'], ['Sincronización con el ECG', 'ECG synchronization', 'Sincronização com o ECG'],
  ['Perfusión cerebral', 'Brain perfusion', 'Perfusão cerebral'], ['Protección del feto', 'Fetal protection', 'Proteção do feto'], ['Manejo del evento del paciente', 'Handling of the patient event', 'Manejo do evento do paciente'],
  ['Calidad: control del movimiento', 'Quality: motion control', 'Qualidade: controle de movimento'], ['Interpretación del hallazgo', 'Finding interpretation', 'Interpretação do achado'], ['Protección radiológica y despacho', 'Radiation protection and discharge', 'Proteção radiológica e liberação'],
  ['Identificación del artefacto', 'Artifact identification', 'Identificação do artefato'], ['Corrección', 'Correction', 'Correção'],
  ['Correcto.', 'Correct.', 'Correto.'], ['Respuesta correcta.', 'Correct answer.', 'Resposta correta.'], ['Sin artefactos de movimiento.', 'No motion artifacts.', 'Sem artefatos de movimento.'],
  // Panel docente
  ['panel del docente', 'teacher panel', 'painel do professor'], ['Clase en el servidor', 'Class on the server', 'Turma no servidor'], ['Crear clase', 'Create class', 'Criar turma'], ['Abrir clase', 'Open class', 'Abrir turma'],
  ['PIN del docente', 'Teacher PIN', 'PIN do professor'], ['Código', 'Code', 'Código'], ['Crear', 'Create', 'Criar'], ['Cargar resultados', 'Load results', 'Carregar resultados'], ['Actualizar', 'Refresh', 'Atualizar'],
  ['Actualizar cada 30 s', 'Refresh every 30 s', 'Atualizar a cada 30 s'], ['Importar archivos', 'Import files', 'Importar arquivos'], ['Caso', 'Case', 'Caso'], ['Estudiante', 'Student', 'Aluno'], ['Todos', 'All', 'Todos'],
  ['Buscar', 'Search', 'Buscar'], ['Vaciar', 'Clear', 'Limpar'], ['Promedio por caso', 'Average by case', 'Média por caso'], ['Criterios más débiles', 'Weakest criteria', 'Critérios mais fracos'], ['Intentos', 'Attempts', 'Tentativas'],
  ['Fecha', 'Date', 'Data'], ['Puntuación', 'Score', 'Pontuação'], ['Estudiantes', 'Students', 'Alunos'], ['Promedio', 'Average', 'Média'], ['Aprobado', 'Passed', 'Aprovado'], ['No aprobado', 'Not passed', 'Não aprovado'], ['Informe', 'Report', 'Relatório'],
  ['Sin datos cargados', 'No data loaded', 'Sem dados carregados'], ['Sin datos.', 'No data.', 'Sem dados.'], ['Sin intentos.', 'No attempts.', 'Sem tentativas.'],
  // Editor
  ['editor de casos', 'case editor', 'editor de casos'], ['Paciente (ficticio)', 'Patient (fictitious)', 'Paciente (fictício)'], ['Lesiones', 'Lesions', 'Lesões'], ['+ Añadir lesión', '+ Add lesion', '+ Adicionar lesão'],
  ['Pregunta final', 'Final question', 'Pergunta final'], ['Vista previa', 'Preview', 'Pré-visualização'], ['Guardar', 'Save', 'Salvar'], ['Guardar caso', 'Save case', 'Salvar caso'], ['Nuevo', 'New', 'Novo'],
  ['Probar en el simulador', 'Try in the simulator', 'Testar no simulador'], ['Exportar todos (JSON)', 'Export all (JSON)', 'Exportar todos (JSON)'], ['Importar JSON', 'Import JSON', 'Importar JSON'], ['Editar', 'Edit', 'Editar'], ['Borrar', 'Delete', 'Apagar'],
  ['Título', 'Title', 'Título'], ['Protocolo esperado', 'Expected protocol', 'Protocolo esperado'], ['Orden médica', 'Medical order', 'Pedido médico'], ['Pregunta', 'Question', 'Pergunta'], ['Respuesta correcta', 'Correct answer', 'Resposta correta'],
  ['Documento', 'ID', 'Documento'], ['Fecha de nacimiento', 'Date of birth', 'Data de nascimento'], ['Edad', 'Age', 'Idade'], ['Sexo', 'Sex', 'Sexo'], ['Peso (kg)', 'Weight (kg)', 'Peso (kg)'], ['Talla (cm)', 'Height (cm)', 'Altura (cm)'],
  ['Alergias', 'Allergies', 'Alergias'], ['Metformina', 'Metformin', 'Metformina'], ['Colaborador', 'Cooperative', 'Colaborativo'],
  // Fase C: ajustes, preguntas, ECOE, turno y monitor en vivo
  ['Ajustes', 'Settings', 'Configurações'], ['Banco de preguntas', 'Question bank', 'Banco de questões'], ['ECOE (docente)', 'OSCE (teacher)', 'OSCE (professor)'],
  ['banco de preguntas', 'question bank', 'banco de questões'], ['Configurar el cuestionario', 'Set up the quiz', 'Configurar o questionário'], ['Empezar', 'Start', 'Começar'],
  ['Nombre o código', 'Name or code', 'Nome ou código'], ['Preguntas', 'Questions', 'Questões'], ['Temas (ninguno marcado = todos):', 'Topics (none ticked = all):', 'Temas (nenhum marcado = todos):'],
  ['Resultado', 'Result', 'Resultado'], ['Repetir con otras preguntas', 'Retry with other questions', 'Repetir com outras questões'], ['Repasar solo las falladas', 'Review only the missed ones', 'Revisar só as erradas'],
  ['Física y formación de la imagen', 'Physics and image formation', 'Física e formação da imagem'], ['Dosimetría', 'Dosimetry', 'Dosimetria'], ['Protección radiológica', 'Radiation protection', 'Proteção radiológica'],
  ['Medios de contraste', 'Contrast media', 'Meios de contraste'], ['Protocolos y técnica', 'Protocols and technique', 'Protocolos e técnica'], ['Artefactos', 'Artifacts', 'Artefatos'], ['Seguridad del paciente', 'Patient safety', 'Segurança do paciente'],
  ['Turno en el servicio', 'Shift in the department', 'Plantão no serviço'], ['Empezar un turno', 'Start a shift', 'Começar um plantão'], ['Pacientes', 'Patients', 'Pacientes'],
  ['Lista de trabajo', 'Worklist', 'Lista de trabalho'], ['Llamar al paciente', 'Call the patient', 'Chamar o paciente'], ['Ver la lista de trabajo', 'Show the worklist', 'Ver a lista de trabalho'],
  ['Inmediata', 'Immediate', 'Imediata'], ['Urgente', 'Urgent', 'Urgente'], ['Programada', 'Scheduled', 'Programada'], ['Resumen del turno', 'Shift summary', 'Resumo do plantão'],
  ['ECOE por estaciones', 'Station-based OSCE', 'OSCE por estações'], ['1. Estaciones', '1. Stations', '1. Estações'], ['+ Añadir estación', '+ Add station', '+ Adicionar estação'],
  ['2. Cuestionario teórico (opcional)', '2. Theory quiz (optional)', '2. Questionário teórico (opcional)'], ['3. Criterios y enlace', '3. Criteria and link', '3. Critérios e link'],
  ['Generar enlace', 'Generate link', 'Gerar link'], ['Copiar', 'Copy', 'Copiar'], ['Probar', 'Try', 'Testar'], ['Verificar certificado', 'Verify certificate', 'Verificar certificado'], ['Verificar', 'Verify', 'Verificar'],
  ['Comenzar el ECOE', 'Begin the OSCE', 'Começar o OSCE'], ['Tiempo agotado', 'Time is up', 'Tempo esgotado'], ['Continuar', 'Continue', 'Continuar'], ['Entregar', 'Submit', 'Entregar'],
  ['En vivo', 'Live', 'Ao vivo'], ['Estudiante', 'Student', 'Estudante'], ['Caso', 'Case', 'Caso'], ['Paso', 'Step', 'Etapa'], ['Aviso', 'Alert', 'Alerta'], ['Nota', 'Score', 'Nota'], ['Hace', 'Ago', 'Há'],
  ['Instrucciones por voz', 'Voice instructions', 'Instruções por voz'], ['Analítica de aprendizaje (xAPI)', 'Learning analytics (xAPI)', 'Análise de aprendizagem (xAPI)'], ['Cerrar', 'Close', 'Fechar'],
  ['Voz', 'Voice', 'Voz'], ['Enviar al LRS', 'Send to the LRS', 'Enviar ao LRS'], ['Enviar ahora', 'Send now', 'Enviar agora'], ['Exportar declaraciones (JSON)', 'Export statements (JSON)', 'Exportar declarações (JSON)'],
  ['Clave', 'Key', 'Chave'], ['Secreto', 'Secret', 'Segredo'],
  // Identidad institucional e informe
  ['Desarrollado por los Laboratorios de Salud y Deporte Bogotá de la Facultad de Ciencias de la Salud y del Deporte', 'Developed by the Bogotá Health and Sport Laboratories of the Faculty of Health and Sport Sciences', 'Desenvolvido pelos Laboratórios de Saúde e Esporte de Bogotá da Faculdade de Ciências da Saúde e do Esporte'],
  ['Laboratorios de Salud y Deporte Bogotá · Facultad de Ciencias de la Salud y del Deporte', 'Bogotá Health and Sport Laboratories · Faculty of Health and Sport Sciences', 'Laboratórios de Saúde e Esporte de Bogotá · Faculdade de Ciências da Saúde e do Esporte'],
  ['Fundación Universitaria del Área Andina · Bogotá', 'Fundación Universitaria del Área Andina · Bogotá', 'Fundación Universitaria del Área Andina · Bogotá'],
  ['Manual', 'Manual', 'Manual'], ['Manual de uso', 'User manual', 'Manual de uso'], ['Informe de evaluación', 'Assessment report', 'Relatório de avaliação'], ['Imprimir / PDF', 'Print / PDF', 'Imprimir / PDF'],
  ['Excelente', 'Excellent', 'Excelente'], ['Aprobado', 'Passed', 'Aprovado'], ['Aprobado con observaciones', 'Passed with remarks', 'Aprovado com observações'], ['No aprobado: repita el caso', 'Not passed: repeat the case', 'Não aprovado: repita o caso'],
  ['Detalle por criterio', 'Detail by criterion', 'Detalhe por critério'], ['Aprendizaje clave del caso', 'Key learning point', 'Aprendizado-chave do caso'], ['Lo que hizo bien', 'What you did well', 'O que fez bem'], ['Qué mejorar, por prioridad', 'What to improve, by priority', 'O que melhorar, por prioridade'],
  ['Estudiante', 'Student', 'Estudante'], ['Fecha', 'Date', 'Data'], ['Tiempo', 'Time', 'Tempo'], ['Modo', 'Mode', 'Modo'], ['DLP total', 'Total DLP', 'DLP total'],
  // Fase D: física, reconstrucción y atlas
  ['Física de la simulación', 'Simulation physics', 'Física da simulação'], ['Algoritmo', 'Algorithm', 'Algoritmo'], ['SART iterativa', 'Iterative SART', 'SART iterativa'],
  ['Calibración en aire del detector', 'Detector air calibration', 'Calibração do detector no ar'], ['Dispersión', 'Scatter', 'Espalhamento'], ['Endurecimiento por hueso', 'Bone beam hardening', 'Endurecimento por osso'],
  ['Con rejilla y corrección (equipo real)', 'With grid and correction (real scanner)', 'Com grade e correção (equipamento real)'], ['Sin corrección (didáctico)', 'Uncorrected (teaching)', 'Sem correção (didático)'],
  ['Sin rejilla ni corrección (didáctico)', 'No grid and no correction (teaching)', 'Sem grade nem correção (didático)'], ['Sin dispersión', 'No scatter', 'Sem espalhamento'],
  ['Corregido en dos pasadas', 'Two-pass correction', 'Corrigido em duas passagens'], ['Sin corregir (didáctico)', 'Uncorrected (teaching)', 'Sem correção (didático)'],
  ['atlas anatómico', 'anatomy atlas', 'atlas anatômico'], ['Atlas anatómico', 'Anatomy atlas', 'Atlas anatômico'], ['Explorar', 'Explore', 'Explorar'], ['Siguiente', 'Next', 'Próxima'],
  ['Ventana', 'Window', 'Janela'], ['Colorear por sistema', 'Colour by system', 'Colorir por sistema'], ['Identifique la estructura marcada con la cruz.', 'Identify the structure marked by the crosshair.', 'Identifique a estrutura marcada pela cruz.'],
  ['Hombre adulto (75 kg)', 'Adult man (75 kg)', 'Homem adulto (75 kg)'], ['Mujer adulta (65 kg)', 'Adult woman (65 kg)', 'Mulher adulta (65 kg)'], ['Paciente con obesidad (120 kg)', 'Patient with obesity (120 kg)', 'Paciente com obesidade (120 kg)'],
  ['Niño de 5 años', '5-year-old child', 'Criança de 5 anos'], ['Embarazada de 24 semanas', '24 weeks pregnant', 'Gestante de 24 semanas'], ['Partes blandas', 'Soft tissue', 'Partes moles'], ['Cerebro', 'Brain', 'Cérebro'], ['Pulmón', 'Lung', 'Pulmão'], ['Hueso', 'Bone', 'Osso'],
];

const PATTERNS = [
  [/^Láser coronal (\d+) mm por ENCIMA de la línea medioaxilar$/, ['Coronal laser $1 mm ABOVE the mid-axillary line', 'Laser coronal $1 mm ACIMA da linha axilar média']],
  [/^Láser coronal (\d+) mm por DEBAJO de la línea medioaxilar$/, ['Coronal laser $1 mm BELOW the mid-axillary line', 'Laser coronal $1 mm ABAIXO da linha axilar média']],
  [/^Cero en: (.+)\.$/, ['Zero at: $1.', 'Zero em: $1.']],
  [/^Corte (\d+)\/(\d+)$/, ['Slice $1/$2', 'Corte $1/$2']],
  [/^(\d+) años$/, ['$1 years', '$1 anos']],
  // Línea del paciente y barra superior: traducen también el título del caso que llevan dentro
  [/^Paciente: (.+) · nac\. (.+)$/, (m, l) => `${l === 'en' ? 'Patient' : 'Paciente'}: ${m[1]} · ${l === 'en' ? 'born' : 'nasc.'} ${m[2]}`],
  [/^· (\d+) años · ([\d.,]+) kg · (.+)$/, (m, l) => `· ${m[1]} ${l === 'en' ? 'years' : 'anos'} · ${m[2]} kg · ${map[l].get(m[3]) || m[3]}`],
];

const map = { en: new Map(), pt: new Map() };
for (const [es, en, pt] of T) { map.en.set(es, en); map.pt.set(es, pt); }

// Más traducciones (p. ej. el contenido clínico de los casos); retraduce lo que ya está en pantalla
export function addTranslations(rows) {
  for (const [es, en, pt] of rows) { if (en) map.en.set(es.trim(), en); if (pt) map.pt.set(es.trim(), pt); }
  if (lang !== 'es' && typeof document !== 'undefined' && document.body) translateNode(document.body);
}
export const translate = (s, l) => (l === 'es' ? s : map[l]?.get(String(s).trim()) || s);

let lang = 'es';
const original = new WeakMap(); // nodo de texto → texto en español
const originalAttr = new WeakMap();

function tr(s) {
  if (lang === 'es') return s;
  const key = s.trim();
  if (!key) return s;
  const hit = map[lang].get(key);
  if (hit) return s.replace(key, hit);
  for (const [re, out] of PATTERNS) {
    const m = key.match(re);
    if (m) return s.replace(key, typeof out === 'function' ? out(m, lang) : key.replace(re, out[lang === 'en' ? 0 : 1]));
  }
  return s;
}

function translateNode(node) {
  if (node.nodeType === 3) {
    if (!original.has(node) || (node.nodeValue !== original.get(node).out)) original.set(node, { es: node.nodeValue, out: null });
    const o = original.get(node);
    const out = tr(o.es);
    o.out = out;
    if (node.nodeValue !== out) node.nodeValue = out;
    return;
  }
  if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.closest?.('[data-no-i18n]')) return;
  for (const a of ['placeholder', 'title', 'aria-label']) {
    if (!node.hasAttribute(a)) continue;
    let rec = originalAttr.get(node) || {};
    if (rec[a] === undefined || node.getAttribute(a) !== rec[`${a}:out`]) rec[a] = node.getAttribute(a);
    const out = tr(rec[a]);
    rec[`${a}:out`] = out;
    originalAttr.set(node, rec);
    if (node.getAttribute(a) !== out) node.setAttribute(a, out);
  }
  for (const c of node.childNodes) translateNode(c);
}

let observer = null;
export function setLang(l) {
  lang = LANGS[l] ? l : 'es';
  try { localStorage.setItem(KEY, lang); } catch { /* sin almacenamiento */ }
  document.documentElement.lang = lang;
  translateNode(document.body);
  for (const d of document.querySelectorAll('dialog')) translateNode(d);
  if (!observer) {
    observer = new MutationObserver((muts) => {
      if (lang === 'es') return;
      for (const m of muts) {
        if (m.type === 'characterData') translateNode(m.target);
        else for (const n of m.addedNodes) translateNode(n);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
}

export function getLang() { return lang; }

// Añade el selector de idioma a la barra superior y aplica el idioma guardado (o ?lang=en|pt)
export function initI18n() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  let saved = 'es';
  try { saved = localStorage.getItem(KEY) || 'es'; } catch { /* sin almacenamiento */ }
  const bar = document.querySelector('.topbar');
  if (bar && !document.getElementById('langSel')) {
    const sel = document.createElement('select');
    sel.id = 'langSel';
    sel.setAttribute('data-no-i18n', '');
    sel.title = 'Idioma / Language';
    sel.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    sel.onchange = () => setLang(sel.value);
    bar.append(sel);
    sel.value = fromUrl || saved;
  }
  setLang(fromUrl || saved);
}
