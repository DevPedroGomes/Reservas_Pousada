// Configurações
const API_URL = '/api';
const TOTAL_QUARTOS = 25;

// Estado da aplicação
let currentUser = null;
let token = localStorage.getItem('token');

// Elementos DOM
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const navLinks = document.querySelectorAll('.nav-link');
const pageContents = document.querySelectorAll('.page-content');
const btnNovaReserva = document.getElementById('btn-nova-reserva');
const btnFiltrar = document.getElementById('btn-filtrar');
const reservaForm = document.getElementById('reserva-form');
const btnCancelar = document.getElementById('btn-cancelar');
const confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
const confirmMessage = document.getElementById('confirm-message');
const confirmBtn = document.getElementById('confirm-btn');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  // Configurar datepickers
  const datepickers = document.querySelectorAll('.datepicker');
  datepickers.forEach(input => {
    flatpickr(input, {
      locale: 'pt',
      dateFormat: 'Y-m-d',
      allowInput: true
    });
  });

  // Preencher select de quartos
  const quartoSelect = document.getElementById('quarto');
  for (let i = 1; i <= TOTAL_QUARTOS; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Quarto ${i}`;
    quartoSelect.appendChild(option);
  }

  // Verificar autenticação
  if (token) {
    verificarToken();
  } else {
    mostrarLogin();
  }

  // Event listeners
  loginForm.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  navLinks.forEach(link => {
    link.addEventListener('click', handleNavClick);
  });
  btnNovaReserva.addEventListener('click', () => mostrarPagina('nova-reserva'));
  btnFiltrar.addEventListener('click', carregarReservas);
  reservaForm.addEventListener('submit', handleReservaSubmit);
  btnCancelar.addEventListener('click', () => mostrarPagina('reservas'));
});

// Funções de autenticação
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      token = data.token;
      currentUser = data.usuario;
      localStorage.setItem('token', token);
      mostrarApp();
      carregarDashboard();
    } else {
      alert(data.mensagem);
    }
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    alert('Erro ao fazer login. Tente novamente.');
  }
}

async function verificarToken() {
  try {
    const response = await fetch(`${API_URL}/auth/verificar`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      currentUser = data.usuario;
      mostrarApp();
      carregarDashboard();
    } else {
      localStorage.removeItem('token');
      mostrarLogin();
    }
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    localStorage.removeItem('token');
    mostrarLogin();
  }
}

function handleLogout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  mostrarLogin();
}

// Funções de navegação
function mostrarLogin() {
  loginContainer.classList.remove('d-none');
  appContainer.classList.add('d-none');
}

function mostrarApp() {
  loginContainer.classList.add('d-none');
  appContainer.classList.remove('d-none');
  userInfo.textContent = `Olá, ${currentUser.nome}`;
}

function handleNavClick(e) {
  e.preventDefault();
  const page = e.target.dataset.page;
  mostrarPagina(page);
}

function mostrarPagina(page) {
  // Atualizar navegação
  navLinks.forEach(link => {
    if (link.dataset.page === page) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  // Mostrar conteúdo da página
  pageContents.forEach(content => {
    if (content.id === `${page}-page`) {
      content.classList.remove('d-none');
    } else {
      content.classList.add('d-none');
    }
  });
  
  // Carregar dados específicos da página
  if (page === 'dashboard') {
    carregarDashboard();
  } else if (page === 'reservas') {
    carregarReservas();
  } else if (page === 'nova-reserva') {
    limparFormularioReserva();
  }
}

// Funções do Dashboard
async function carregarDashboard() {
  try {
    const response = await fetch(`${API_URL}/reservas`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      const reservas = data.reservas;
      
      // Contadores
      const reservasAtivas = reservas.filter(r => r.status === 'ativa').length;
      const reservasHoje = reservas.filter(r => {
        const hoje = new Date().toISOString().split('T')[0];
        return r.data_entrada === hoje || r.data_saida === hoje;
      }).length;
      
      document.getElementById('reservas-ativas-count').textContent = reservasAtivas;
      document.getElementById('quartos-disponiveis-count').textContent = TOTAL_QUARTOS - reservasAtivas;
      document.getElementById('reservas-hoje-count').textContent = reservasHoje;
      
      // Próximas reservas
      const proximasReservas = reservas
        .filter(r => r.status === 'ativa')
        .sort((a, b) => new Date(a.data_entrada) - new Date(b.data_entrada))
        .slice(0, 5);
      
      const tbody = document.getElementById('proximas-reservas');
      tbody.innerHTML = '';
      
      proximasReservas.forEach(reserva => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${reserva.nome}</td>
          <td>Quarto ${reserva.quarto}</td>
          <td>${formatarData(reserva.data_entrada)}</td>
          <td>${formatarData(reserva.data_saida)}</td>
          <td><span class="status-badge status-${reserva.status}">${reserva.status}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
    alert('Erro ao carregar dashboard. Tente novamente.');
  }
}

// Funções de Reservas
async function carregarReservas() {
  try {
    const status = document.getElementById('filtro-status').value;
    const dataInicio = document.getElementById('filtro-data-inicio').value;
    const dataFim = document.getElementById('filtro-data-fim').value;
    const pago = document.getElementById('filtro-pagamento').value;
    
    let url = `${API_URL}/reservas`;
    const params = new URLSearchParams();
    
    if (status) {
      params.append('status', status);
    }
    
    if (dataInicio && dataFim) {
      params.append('data_inicio', dataInicio);
      params.append('data_fim', dataFim);
    }
    
    if (pago) {
      params.append('pago', pago);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      const tbody = document.getElementById('lista-reservas');
      tbody.innerHTML = '';
      
      data.reservas.forEach(reserva => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${reserva.id}</td>
          <td>${reserva.nome}</td>
          <td>${reserva.cpf}</td>
          <td>Quarto ${reserva.quarto}</td>
          <td>${formatarData(reserva.data_entrada)}</td>
          <td>${formatarData(reserva.data_saida)}</td>
          <td>${reserva.valor ? formatarValor(reserva.valor) : '-'}</td>
          <td>${reserva.pago ? '<span class="badge bg-success">Sim</span>' : '<span class="badge bg-danger">Não</span>'}</td>
          <td><span class="status-badge status-${reserva.status}">${reserva.status}</span></td>
          <td>
            <button class="btn btn-sm btn-primary btn-action" onclick="editarReserva(${reserva.id})">
              <i class="bi bi-pencil"></i> Editar
            </button>
            <button class="btn btn-sm btn-danger btn-action" onclick="confirmarExclusao(${reserva.id})">
              <i class="bi bi-trash"></i> Excluir
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Erro ao carregar reservas:', error);
    alert('Erro ao carregar reservas. Tente novamente.');
  }
}

async function editarReserva(id) {
  try {
    const response = await fetch(`${API_URL}/reservas/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      const reserva = data.reserva;
      
      document.getElementById('reserva-id').value = reserva.id;
      document.getElementById('nome').value = reserva.nome;
      document.getElementById('cpf').value = reserva.cpf;
      document.getElementById('quarto').value = reserva.quarto;
      document.getElementById('data-entrada').value = reserva.data_entrada;
      document.getElementById('data-saida').value = reserva.data_saida;
      document.getElementById('status').value = reserva.status;
      document.getElementById('valor').value = reserva.valor || '';
      document.getElementById('pago').value = reserva.pago ? 'true' : 'false';
      document.getElementById('observacoes').value = reserva.observacoes || '';
      
      document.getElementById('form-titulo').textContent = 'Editar Reserva';
      mostrarPagina('nova-reserva');
    }
  } catch (error) {
    console.error('Erro ao carregar reserva:', error);
    alert('Erro ao carregar reserva. Tente novamente.');
  }
}

async function handleReservaSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('reserva-id').value;
  const reserva = {
    nome: document.getElementById('nome').value,
    cpf: document.getElementById('cpf').value,
    quarto: document.getElementById('quarto').value,
    data_entrada: document.getElementById('data-entrada').value,
    data_saida: document.getElementById('data-saida').value,
    status: document.getElementById('status').value,
    valor: document.getElementById('valor').value || null,
    pago: document.getElementById('pago').value === 'true',
    observacoes: document.getElementById('observacoes').value
  };
  
  try {
    const url = id ? `${API_URL}/reservas/${id}` : `${API_URL}/reservas`;
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(reserva)
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      alert(id ? 'Reserva atualizada com sucesso!' : 'Reserva criada com sucesso!');
      mostrarPagina('reservas');
      carregarReservas();
    } else {
      alert(data.mensagem);
    }
  } catch (error) {
    console.error('Erro ao salvar reserva:', error);
    alert('Erro ao salvar reserva. Tente novamente.');
  }
}

function confirmarExclusao(id) {
  confirmMessage.textContent = 'Tem certeza que deseja excluir esta reserva?';
  confirmBtn.onclick = () => excluirReserva(id);
  confirmModal.show();
}

async function excluirReserva(id) {
  try {
    const response = await fetch(`${API_URL}/reservas/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.sucesso) {
      confirmModal.hide();
      alert('Reserva excluída com sucesso!');
      carregarReservas();
    } else {
      alert(data.mensagem);
    }
  } catch (error) {
    console.error('Erro ao excluir reserva:', error);
    alert('Erro ao excluir reserva. Tente novamente.');
  }
}

function limparFormularioReserva() {
  document.getElementById('reserva-id').value = '';
  document.getElementById('reserva-form').reset();
  document.getElementById('form-titulo').textContent = 'Nova Reserva';
}

// Funções auxiliares
function formatarData(data) {
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
} 